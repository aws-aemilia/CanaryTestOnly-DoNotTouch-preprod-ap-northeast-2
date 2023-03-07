import yargs from "yargs";
import pino from "pino";
import fs from "fs";
import pinoPretty from "pino-pretty";
import { hideBin } from "yargs/helpers";
import {
  updateRecordsInHostedZone,
  getOrCreateHostedZone,
  getRecordsFromHostedZone,
} from "../route53";
import { toRegionName } from "../utils/regions";
import { rollbackDelegation } from "./rollback";
import {
  Stage,
  Region,
  rootDomainAccount,
  domainAccount,
  getIsengardCredentialsProvider,
} from "../Isengard";
import {
  ResourceRecordSet,
  Change,
  ChangeAction,
  Route53Client,
} from "@aws-sdk/client-route-53";

const logger = pino(pinoPretty());

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      "Moves a Hosting Gateway subdomain from the root hosted zone into its own hosted zone"
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
    .option("mcm", {
      describe: `ID of the MCM being executed`,
      type: "string",
      demandOption: true,
    })
    .option("rollback", {
      describe: `Run it in rollback mode to revert delegation`,
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, mcm, rollback } = args;
  const stage = args.stage as Stage;
  const regionName = toRegionName(region);
  const regionalDomainName = `${stage}.${regionName}.gateway.amplify.aws.dev`;
  process.env.ISENGARD_SIM = mcm;

  // Root hosted zone (gateway.amplify.aws.dev) is the one that currently holds all of
  // the subdomains for all stages and regions.
  const rootHostedZoneId = "Z06330931XFXCBAZV8FES";

  // Initialize route53 clients for root and regional domain accounts
  const rootAccount = rootDomainAccount();
  const rootRoute53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      rootAccount.accountId,
      "Route53Manager"
    ),
  });

  const regionalAccount = await domainAccount(stage, region as Region);
  const regionalRoute53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      regionalAccount.accountId,
      "Route53Manager"
    ),
  });

  if (rollback) {
    return rollbackDelegation(
      rootRoute53Client,
      rootHostedZoneId,
      regionalDomainName
    );
  }

  // Create the new regional hosted zone. For non-prod, it gets created in the amplify-team-domains@
  // account. For prod, it gets created in the aws-mobile-aemilia-domains@ account.
  logger.info(`Creating new hosted zone for ${regionalDomainName}`);
  const regionalHostedZoneId = await createHostedZone(
    regionalRoute53Client,
    regionalDomainName
  );

  // Load records from file
  const fileName = `dns-records/${stage}-${regionName}.json`;
  const dnsRecords: ResourceRecordSet[] = loadRecords(fileName);
  logger.info(`Reading DNS records from ${fileName}`);

  // Prepare them as UPSERT changes
  const changes: Change[] = dnsRecords.map((record) => ({
    Action: ChangeAction.UPSERT,
    ResourceRecordSet: record,
  }));

  // Insert them into the newly created regional hosted zone.
  logger.info("Inserting DNS records into new regional hosted zone");
  await updateRecordsInHostedZone(regionalRoute53Client, regionalHostedZoneId, {
    Changes: changes,
  });

  logger.info("New hosted zone is ready for delegation");

  // Get the NS records for the new regional hosted zone, these will be used
  // to delegate the subdomain on the root hosted zone
  const nameServerRecord = await getNSRecordFromRegionalHostedZone(
    regionalRoute53Client,
    regionalHostedZoneId,
    regionalDomainName
  );

  logger.info(`NS records [${formatRecord(nameServerRecord)}]`);
  await delegateRegionalDomain(
    rootRoute53Client,
    rootHostedZoneId,
    nameServerRecord,
    regionalDomainName
  );

  logger.info("Delegation completed");
}

async function createHostedZone(
  route53Client: Route53Client,
  domainName: string
): Promise<string> {
  const hostedZone = await getOrCreateHostedZone(
    route53Client,
    domainName,
    "Hosting Gateway per-customer DNS records"
  );

  if (!hostedZone.Id) {
    throw new Error("Could not create hosted zone");
  }

  logger.info(`Regional hosted zone id = ${hostedZone.Id}`);
  return hostedZone.Id;
}

async function getNSRecordFromRegionalHostedZone(
  route53Client: Route53Client,
  regionalHostedZoneId: string,
  regionalDomainName: string
): Promise<ResourceRecordSet> {
  logger.info("Getting NS records from regional hosted zone");
  const nsRecords = await getRecordsFromHostedZone(
    route53Client,
    regionalHostedZoneId,
    regionalDomainName,
    "NS"
  );

  if (nsRecords.length !== 1) {
    logger.error(`Expected only one NS record, found ${nsRecords.length}`);
    throw new Error("Inconsistent NS records from regional hosted zone");
  }

  return nsRecords[0];
}

async function delegateRegionalDomain(
  route53Client: Route53Client,
  rootHostedZoneId: string,
  regionalHostedZoneNSRecord: ResourceRecordSet,
  regionalDomainName: string
) {
  logger.info("Upserting NS records into root hosted zone");
  const resourceRecords = regionalHostedZoneNSRecord.ResourceRecords;

  if (!resourceRecords || resourceRecords.length === 0) {
    logger.error(`NS record has no values: ${JSON.stringify(resourceRecords)}`);
    throw new Error("Unable to proceed");
  }

  await updateRecordsInHostedZone(route53Client, rootHostedZoneId, {
    Changes: [
      {
        Action: ChangeAction.UPSERT,
        ResourceRecordSet: {
          Name: regionalDomainName,
          Type: "NS",
          ResourceRecords: regionalHostedZoneNSRecord.ResourceRecords,
          TTL: 300,
        },
      },
    ],
  });
}

function formatRecord(resourceRecord: ResourceRecordSet): string {
  if (!resourceRecord.ResourceRecords) return "";
  return resourceRecord.ResourceRecords?.map((record) => record.Value).join(
    ", "
  );
}

function loadRecords(fileName: string): ResourceRecordSet[] {
  const json = fs.readFileSync(fileName, "utf8");
  return JSON.parse(json);
}

main()
  .catch((err) => logger.error(err))
  .then(() => logger.info("Done"));
