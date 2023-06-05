import yargs from "yargs";
import logger from "../../Commons/utils/logger";
import { findApp } from "../../Commons/dynamodb/tables/app";
import { getDomain } from "../../Commons/dynamodb/tables/domain";
import { toRegionName } from "../../Commons/utils/regions";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { updateDistribution } from "../../Commons/utils/cloudfront";
import confirm from "../../Commons/utils/confirm";
import {
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import {
  CloudFrontClient,
  DistributionConfig,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { DomainDO } from "../../Commons/dynamodb";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Dissasociate a custom domain from an App that has been suspended. It removes " +
        "the domain from DynamoDB Domain table and from the CloudFront distribution. " +
        "This helps unblock customers who forgot to delete their domain before suspending " +
        "their AWS account.\n\n" +
        "Example usage:\n" +
        "npx ts-node releaseCustomDomain.ts --stage prod --region cmh --ticket D69568945 --appId d123456789 --domainName example.com"
    )
    .option("stage", {
      describe: "Stage to run the command in",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "Region to run the command in (i.e. PDX, us-east-1, etc)",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. V69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "Original appId that has the domain associated to it",
      type: "string",
      demandOption: true,
    })
    .option("domainName", {
      describe: "Custom domain name to dissasociate",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, appId, domainName } = args;
  process.env.ISENGARD_SIM = ticket;

  const regionName = toRegionName(region);
  const cpAccount = await controlPlaneAccount(stage as Stage, region as Region);

  const controlPlaneCreds = getIsengardCredentialsProvider(
    cpAccount.accountId,
    "ReleaseCustomDomain"
  );

  const cloudFront = new CloudFrontClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  const dynamoDB = new DynamoDBClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  const documentClient = DynamoDBDocumentClient.from(dynamoDB);

  logger.info(`Looking up ${appId} in DynamoDB`);
  const app = await findApp(documentClient, stage, regionName, appId, [
    "appId",
    "accountClosureStatus",
  ]);

  if (!app) {
    logger.error(`App ${appId} not found in ${stage} ${region}`);
    return;
  }

  logger.info("Ensuring app is in suspended status (IsolateResources)");
  if (app.accountClosureStatus !== "IsolateResources") {
    logger.error(
      `App ${app.appId} is not in suspended status. Not safe to proceed`
    );
    return;
  }

  logger.info(`Looking up ${domainName} in DynamoDB`);
  const domain = await getDomain(
    documentClient,
    stage,
    regionName,
    appId,
    domainName
  );

  if (!domain) {
    logger.error(`Domain ${domainName} not found in ${stage} ${region}`);
    logger.error(
      "Ensure you are not typing a subdomain. You must provide the root domain"
    );
    return;
  }

  logger.info("Ensuring domain belongs to the provided app");
  if (domain.appId !== appId) {
    logger.error(
      `Domain ${domainName} is not associated with provided App ${appId}. Not safe to proceed`
    );
    return;
  }

  logger.info("Ensuring domain CloudFront distribution is disabled");
  const getDistributionResponse = await cloudFront.send(
    new GetDistributionCommand({ Id: domain.distributionId })
  );

  if (
    getDistributionResponse.Distribution &&
    getDistributionResponse.Distribution.DistributionConfig &&
    getDistributionResponse.Distribution.DistributionConfig.Enabled
  ) {
    logger.error(
      getDistributionResponse.Distribution?.DistributionConfig,
      `Distribution ${domain.distributionId} is not disabled. Not safe to proceed`
    );
    return;
  }

  logger.info("All checks passed, safe to proceed");
  logger.info(`App: ${appId}`);
  logger.info(`Domain to remove: ${domainName}`);
  logger.info(`Domain CloudFront distribution: ${domain.distributionId}`);

  if (!(await confirm(`Proceed releasing ${domainName}?`))) {
    logger.info("Aborted");
    return;
  }

  logger.info("Removing domain from CloudFront distribution");
  await updateDistribution({
    cloudFrontClient: cloudFront,
    distributionId: domain.distributionId,
    updateDistributionConfigFn: (
      config: DistributionConfig
    ): DistributionConfig => {
      return {
        ...config,
        Aliases: {
          Quantity: 0,
          Items: [],
        },
      };
    },
  });
  logger.info("Domain removed from distribution successfully");

  logger.info("Renaming domain in DynamoDB");
  await releaseDomainDO(documentClient, stage, regionName, domain);
  logger.info("Domain released successfully");

  if (!domain.distributionId) {
    logger.info("Domain does not have a CloudFront distribution associated");
    return;
  }
}

async function releaseDomainDO(
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainDO: DomainDO
) {
  // Rename the domaiName by deleting the existing record and creating a new one with the
  // new name, in the same transaction. This is because domainName is the sortKey so DynamoDB
  // doesn't allow updating it.
  const timestamp = new Date().getTime();
  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: `${stage}-${region}-Domain`,
            Key: {
              appId: domainDO.appId,
              domainName: domainDO.domainName,
            },
          },
        },
        {
          Put: {
            TableName: `${stage}-${region}-Domain`,
            Item: {
              ...domainDO, // preserve all attributes
              domainName: `${domainDO.domainName}-RELEASED-${timestamp}`,
            },
          },
        },
      ],
    })
  );
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
