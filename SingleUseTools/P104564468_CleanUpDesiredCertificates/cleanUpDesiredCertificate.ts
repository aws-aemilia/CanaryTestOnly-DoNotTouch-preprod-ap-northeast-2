import { BucketLifecycleConfiguration, S3 } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DomainDO } from "Commons/dynamodb";
import { Region, Stage, StandardRoles } from "Commons/Isengard";
import logger from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  desiredCertificate,
  getBucketName,
  getClients,
  getDomainsToCleanUp,
  Prefix,
  version,
} from "./utils";

const LifecycleConfiguration: BucketLifecycleConfiguration = {
  Rules: [
    {
      ID: "Delete files after 30 days",
      Status: "Enabled",
      Expiration: { Days: 30 },
      Filter: {
        Prefix,
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
        brazil-build CleanUpDesiredCertificate.run -- --stage beta --region pdx
      
        # Record and fix the affected table items in prod PDX.
        brazil-build CleanUpDesiredCertificate.run -- --stage prod --region pdx --removeDesiredCertificate true`
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

async function saveDataToS3(s3: S3, Bucket: string, domains: DomainDO[]) {
  const data = JSON.stringify(domains, null, 2) + "\n";
  await s3.putObject({
    Bucket,
    Key: `${Prefix}${new Date().toUTCString()}.json`,
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
        // Increment the version number to take advantage of optimistic locking
        UpdateExpression: `REMOVE ${desiredCertificate} ADD ${version} :one`,
        ExpressionAttributeValues: { ":one": 1 },
      })
    );
  }
  logger.info(`Removed ${desiredCertificate} attribute from all domains`);
}

async function main() {
  let { stage, region, removeDesiredCertificate } = await getArgs();
  const Bucket = getBucketName(stage, region);

  const { documentClient, s3 } = await getClients(
    stage,
    region,
    StandardRoles.OncallOperator
  );
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
