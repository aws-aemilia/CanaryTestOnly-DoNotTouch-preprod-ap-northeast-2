import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DomainDO, updateWithOptimisticLocking } from "Commons/dynamodb";
import { Stage, StandardRoles } from "Commons/Isengard";
import { RegionName } from "Commons/Isengard/types";
import logger from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getBucketName, getClients, getEarliestBackup } from "./utils";

async function getArgs() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Rollback changes to the  desiredCertificate attribute of Domain item entries in DynamoDB. Used to mitigate
      this Sev2: https://t.corp.amazon.com/P104564468
    
      Usage:
        # Verify that affected table items in beta PDX have been fixed
        brazil-build CleanUpDesiredCertificate.verify -- --stage beta --region pdx`
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
    .option("rollback", {
      describe:
        "Whether to actually perform the rollback. Set this to true when you're ready.",
    })
    .strict()
    .version(false)
    .help().argv;

  args.region = toRegionName(args.region);

  return args as {
    stage: Stage;
    region: RegionName;
    rollback: boolean;
  };
}

async function rollbackDomains(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: RegionName,
  domains: DomainDO[]
) {
  for (const domain of domains) {
    // The version needs to be incremented to reflect the *current state* of the data, because the domain was updated
    // after being backed up. In other words, we're expecting the DDB item to have a higher version.
    domain.version += 1;
    try {
      await updateWithOptimisticLocking(documentClient, stage, region, domain);
      logger.info(`✅ Rollback succeeded for ${domain.domainName}`);
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        logger.warn(`⚠️ Rollback warning: domain ${domain.domainName} with domain ID ${domain.domainId} and app ID
        ${domain.appId} has been modified by the customer since it was backed up. Skipping rollback of this domain.`);
      } else {
        throw e;
      }
    }
  }
}

async function main() {
  const { stage, region, rollback } = await getArgs();
  const Bucket = getBucketName(stage, region);

  const { documentClient, s3 } = await getClients(
    stage,
    region,
    StandardRoles.OncallOperator
  );

  const domains = await getEarliestBackup(s3, Bucket);
  logger.info(`Domains to roll back: ${JSON.stringify(domains)}`);
  if (rollback) {
    await rollbackDomains(documentClient, stage, region, domains);
  }

  logger.info("✅ Rollback complete");
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
