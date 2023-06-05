import yargs from "yargs";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { hideBin } from "yargs/helpers";
import {
  getRecordsFromHostedZone,
  getHostedZone,
} from "../../commons/route53";
import { toRegionName } from "../../commons/utils/regions";
import { ResourceRecordSet, Route53Client } from "@aws-sdk/client-route-53";
import {
  Stage,
  getIsengardCredentialsProvider,
  rootDomainAccount,
  domainAccount,
  Region,
} from "../../commons/Isengard";

const logger = pino(pinoPretty());

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      "Verifies that the Gateway subdomain has been moved from the root hosted zone into its own hosted zone"
    )
    .option("region", {
      describe: `Region to migrate (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
      demandOption: true,
    })
    .option("stage", {
      describe: `Stage to check (e.g. "beta", "gamma", "prod").`,
      choices: ["beta", "gamma", "prod"],
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region } = args;
  const stage = args.stage as Stage;
  const regionName = toRegionName(region);
  const regionalDomainName = `${stage}.${regionName}.gateway.amplify.aws.dev`;

  // Root hosted zone (gateway.amplify.aws.dev) is the one that currently holds all of
  // the subdomains for all stages and regions.
  const rootHostedZoneId = "Z06330931XFXCBAZV8FES";

  // Route53 clients for prod and non-prod domain accounts.
  // Initialize route53 clients for root and regional domain accounts
  const rootAccount = rootDomainAccount();
  const rootRoute53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      rootAccount.accountId,
      "ReadOnly"
    ),
  });

  const regionalAccount = await domainAccount(stage, region as Region);
  const regionalRoute53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      regionalAccount.accountId,
      "ReadOnly"
    ),
  });

  // Find the new regional hosted zone
  const regionalHostedZone = await getHostedZone(
    regionalRoute53Client,
    regionalDomainName
  );

  if (!regionalHostedZone || !regionalHostedZone.Id) {
    logger.error(`Could not find hosted zone for ${regionalDomainName}`);
    throw new Error("Verification failed");
  }

  logger.info("Verifying DNS records in regional hosted zone");

  // Get the DNS records for the regional hosted zone
  const actualRecords = await getRecordsFromHostedZone(
    regionalRoute53Client,
    regionalHostedZone.Id,
    regionalDomainName,
    "ANY"
  );

  // Get the DNS records from the root hosted zone
  const expectedRecords = await getRecordsFromHostedZone(
    rootRoute53Client,
    rootHostedZoneId,
    regionalDomainName,
    "ANY"
  );

  // Compare the expected records from the root hosted zone should have
  // been created in the regional hosted zone.
  const recordsMatch = expectedRecords.every((expectedRecord) => {
    logger.info(`Verifying ${expectedRecord.Type} ${expectedRecord.Name}`);
    return recordExists(expectedRecord, actualRecords);
  });

  if (!recordsMatch) {
    logger.error(`Expected DNS records = ${JSON.stringify(expectedRecords)}`);
    logger.error(`Actual DNS records = ${JSON.stringify(actualRecords)}`);
    throw new Error("Verification failed");
  }

  logger.info("All DNS records match, now checking NS delegation records");

  // Finally check that the NS records from the regional hosted zone
  // exist in the root hosted zone.
  const actualNsRecords = await getRecordsFromHostedZone(
    rootRoute53Client,
    rootHostedZoneId,
    regionalDomainName,
    "NS"
  );

  const expectedNsRecords = await getRecordsFromHostedZone(
    regionalRoute53Client,
    regionalHostedZone.Id,
    regionalDomainName,
    "NS"
  );

  const nsRecordsMatch = expectedNsRecords.every((expectedRecord) => {
    logger.info(
      `Checking NS records [${formatRecord(
        expectedRecord
      )}] exists in root hosted zone`
    );
    return recordExists(expectedRecord, actualNsRecords);
  });

  if (!nsRecordsMatch) {
    logger.error(
      `NS records does not match. Expected = ${JSON.stringify(
        expectedNsRecords
      )}, but found ${JSON.stringify(actualNsRecords)}`
    );
    throw new Error("Validation failed");
  }

  logger.info("Verification successful");
}

function recordExists(
  expectedRecord: ResourceRecordSet,
  actualRecords: ResourceRecordSet[]
): boolean {
  return actualRecords.some(
    (actual) =>
      expectedRecord.Name === actual.Name &&
      expectedRecord.Type === actual.Type &&
      valuesMatch(expectedRecord, actual)
  );
}

function valuesMatch(a: ResourceRecordSet, b: ResourceRecordSet): boolean {
  if (a.AliasTarget && b.AliasTarget) {
    return a.AliasTarget.DNSName === b.AliasTarget.DNSName;
  }

  if (a.ResourceRecords && b.ResourceRecords) {
    const aValues = a.ResourceRecords.map((r) => r.Value);
    const bValues = b.ResourceRecords.map((r) => r.Value);
    return aValues.every((value) => bValues.includes(value));
  }

  return false;
}

function formatRecord(resourceRecord: ResourceRecordSet): string {
  if (!resourceRecord.ResourceRecords) return "";
  return resourceRecord.ResourceRecords?.map((record) => record.Value).join(
    ", "
  );
}

main()
  .catch((err) => logger.error(err))
  .then(() => logger.info("Done"));
