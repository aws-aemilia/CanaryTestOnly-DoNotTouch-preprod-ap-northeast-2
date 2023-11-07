import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DomainDO, findDomain } from "Commons/dynamodb";
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
  getEarliestBackup,
} from "./utils";

async function getArgs() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Verify that desiredCertificate attribute of Domain item entries in DynamoDB were cleaned up. Used to mitigate
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
    .strict()
    .version(false)
    .help().argv;

  args.region = toRegionName(args.region);

  return args as {
    stage: Stage;
    region: Region;
  };
}

async function compareToCurrentDomains(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: Region,
  backedUpDomains: DomainDO[]
) {
  let warningMessage = "";
  for (const backedUpDomain of backedUpDomains) {
    delete backedUpDomain.desiredCertificate;
    const domainName = backedUpDomain.domainName;

    const currentDomain = await findDomain(
      documentClient,
      stage,
      region,
      domainName
    );
    if (backedUpDomain !== currentDomain) {
      warningMessage += `⚠️ Verification warning: There is a discrepancy between the backup and the current state of
      domain ${domainName}. While this can be explained by the customer changing properties on the domain, you may want
      to manually compare them. \n
      Backed up domain: ${backedUpDomain} \n
      Current domain: ${currentDomain} \n`;
    }
  }
  console.warn(warningMessage);
}

async function main() {
  const { stage, region } = await getArgs();
  const Bucket = getBucketName(stage, region);

  const { documentClient, s3 } = await getClients(
    stage,
    region,
    StandardRoles.FullReadOnly
  );

  const affectedDomains = await getDomainsToCleanUp(
    documentClient,
    stage,
    region
  );
  if (affectedDomains.length > 0) {
    const affectedDomainNames = affectedDomains.map(
      (domain) => domain.domainName
    );
    throw Error(
      `❌ Verification failed: Found ${
        affectedDomainNames.length
      } domains that still have ${desiredCertificate}:\n
      ${JSON.stringify(affectedDomainNames, null, 2)}`
    );
  }

  const backedUpDomains = await getEarliestBackup(s3, Bucket);
  await compareToCurrentDomains(documentClient, stage, region, backedUpDomains);

  logger.info("✅ Verification succeeded");
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
