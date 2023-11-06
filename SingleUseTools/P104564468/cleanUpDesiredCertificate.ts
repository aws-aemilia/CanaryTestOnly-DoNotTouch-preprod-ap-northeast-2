import { BucketLifecycleConfiguration, S3 } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  DomainDO,
  getDynamoDBDocumentClient,
  paginateDomains,
} from "Commons/dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "Commons/Isengard";
import { createLogger } from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const logger = createLogger();
const role = StandardRoles.OncallOperator;

const desiredCertificate = "desiredCertificate";
const backups = "backups/";
const LifecycleConfiguration: BucketLifecycleConfiguration = {
  Rules: [
    {
      ID: "Delete files after 30 days",
      Status: "Enabled",
      Expiration: { Days: 30 },
      Filter: {
        Prefix: backups,
      },
    },
  ],
};

async function getArgs() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Clean up the desiredCertificate attribute of Domain item entries in DynamoDB. Used to mitigate this Sev2: 
      https://t.corp.amazon.com/P104564468
    
      Usage:
        # Record the affected table items in beta PDX. Does not perform any updates to the table items.
        ts-node cleanUpDesiredCertificate.ts --stage beta --region pdx
      
        # Record and fix the affected table items in prod PDX.
        ts-node cleanUpDesiredCertificate.ts --stage prod --region pdx --removeDesiredCertificate true`
    )
    .option("stage", {
      describe: "Stage to clean up.",
      type: "string",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "Region to run the command in (e.g. PDX, pdx, us-east-1).",
      type: "string",
      demandOption: true,
    })
    .option("removeDesiredCertificate", {
      describe:
        "Whether to actually clean up the desiredCertificate attribute. Set this to true when you're ready.",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;

  args.region = toRegionName(args.region);

  return args as {
    stage: Stage;
    region: Region;
    removeDesiredCertificate: boolean;
  };
}

async function getClients(stage: Stage, region: Region) {
  const account = await controlPlaneAccount(stage, region);
  await preflightCAZ({ accounts: account, role });
  const credentials = getIsengardCredentialsProvider(account.accountId, role);

  const documentClient = getDynamoDBDocumentClient(region, credentials);
  const s3 = new S3({ region, credentials });
  return { documentClient, s3 };
}

async function createBucketIfNotExists(s3: S3, Bucket: string) {
  try {
    await s3.headBucket({ Bucket });
    logger.info(`Bucket already exists: ${Bucket}`);
  } catch (e) {
    await s3.createBucket({ Bucket });
    await s3.putBucketLifecycleConfiguration({
      Bucket,
      LifecycleConfiguration,
    });
    logger.info(`Created bucket: ${Bucket}`);
  }
  await s3.putObject({
    Bucket,
    Key: "README",
    Body: "This bucket was created as a part of mitigating this Sev2: https://t.corp.amazon.com/P104564468",
  });
}

async function getDomainsToCleanUp(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: Region
) {
  const paginatedDomains = paginateDomains(
    documentClient,
    stage,
    region,
    undefined,
    undefined,
    `attribute_exists(${desiredCertificate})`
  );

  const domains = [];
  for await (const page of paginatedDomains) {
    domains.push(...(page.Items as DomainDO[]));
  }

  logger.info(`Found ${domains.length} domains to clean up`);
  return domains;
}

async function saveDataToS3(s3: S3, Bucket: string, domains: DomainDO[]) {
  const data = JSON.stringify(domains, null, 2) + "\n";
  await s3.putObject({
    Bucket,
    Key: `${backups}${new Date().toUTCString()}.json`,
    Body: data,
  });
  logger.info(`Saved domain data to S3`);
}

async function removeDesiredCertificateAttribute(
  affectedDomains: DomainDO[],
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: Region
) {
  for (const domain of affectedDomains) {
    await documentClient.send(
      new UpdateCommand({
        TableName: `${stage}-${region}-Domain`,
        Key: { appId: domain.appId, domainName: domain.domainName },
        UpdateExpression: `REMOVE ${desiredCertificate}`,
      })
    );
  }
  logger.info(`Removed ${desiredCertificate} attribute from all domains`);
}

async function main() {
  let { stage, region, removeDesiredCertificate } = await getArgs();
  const Bucket = `${stage}-${region}-cleanup-desired-certificate`;

  const { documentClient, s3 } = await getClients(stage, region);
  await createBucketIfNotExists(s3, Bucket);

  const domains = await getDomainsToCleanUp(documentClient, stage, region);
  await saveDataToS3(s3, Bucket, domains);

  if (removeDesiredCertificate) {
    await removeDesiredCertificateAttribute(
      domains,
      documentClient,
      stage,
      region
    );
  }
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
