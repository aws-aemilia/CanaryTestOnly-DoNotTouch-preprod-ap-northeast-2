/**
 * This is a single use case script which adds DNS records into the regional domain accounts delegated hosted zone.
 * This script does not perform domain delegation. This will be done through cdk in a future effort.
 */

import yargs from "yargs";
import {
  dataPlaneAccount,
  Region,
  Stage,
  domainAccount,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";

import logger from "../../Commons/utils/logger";
import confirm from "../../Commons/utils/confirm";
import { ChangeAction, Route53Client } from "@aws-sdk/client-route-53";
import { updateRecordsInHostedZone } from "../../Commons/route53";
import { getAndValidateCFNOutputs, getGatewayHostedZone } from "./utils";

const addRecords = async (stage: Stage, region: Region) => {
  // Fetch the hostname and hostedZone values for the ALBs in the Gateway account.
  const gatewayAccount = await dataPlaneAccount(stage, region as Region);
  const regionalDomainAccount = await domainAccount(stage, region as Region);

  const stackName = `HostingGateway-${stage}`;
  const outputs = await getAndValidateCFNOutputs(gatewayAccount, stackName);

  // Initialize route53 clients for central domain account
  const route53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      regionalDomainAccount.accountId,
      "Route53Manager"
    ),
  });

  // Fetch the Hosted Zone Id from the regional domain account.
  // This is where we will update records from.
  const gatewayRegionalDomain = `${stage}.${region}.gateway.amplify.aws.dev`;
  const hostedZoneId = await getGatewayHostedZone(
    route53Client,
    gatewayRegionalDomain
  );

  // Changes to be made to the hosted zone
  const changes = [
    {
      Action: ChangeAction.CREATE,
      ResourceRecordSet: {
        Name: gatewayRegionalDomain,
        Type: "A",
        Weight: 50,
        SetIdentifier: "HostingGatewayALBShard1",
        AliasTarget: {
          DNSName: outputs.HostingGatewayALBShard1DNS,
          HostedZoneId: outputs.HostingGatewayALBShard1HostedZoneId,
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: ChangeAction.CREATE,
      ResourceRecordSet: {
        Name: gatewayRegionalDomain,
        Type: "A",
        Weight: 50,
        SetIdentifier: "HostingGatewayALBShard2",
        AliasTarget: {
          DNSName: outputs.HostingGatewayALBShard2DNS,
          HostedZoneId: outputs.HostingGatewayALBShard2HostedZoneId,
          EvaluateTargetHealth: false,
        },
      },
    },
    {
      Action: ChangeAction.CREATE,
      ResourceRecordSet: {
        Name: `_dmarc.${gatewayRegionalDomain}`,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [
          {
            Value:
              '"v=DMARC1; p=reject; rua=mailto:report@dmarc.amazon.com; ruf=mailto:report@dmarc.amazon.com"',
          },
        ],
      },
    },
    {
      Action: ChangeAction.CREATE,
      ResourceRecordSet: {
        Name: gatewayRegionalDomain,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [
          {
            Value:
              '"v=DMARC1; p=reject; rua=mailto:report@dmarc.amazon.com; ruf=mailto:report@dmarc.amazon.com"',
          },
        ],
      },
    },
  ];

  logger.info(changes, "The following DNS changes will be applied");

  // Perform the Route53 BatchChangeRequest. We need to perform the removal of the
  // existing record and the addition of the new ones in the same batch to avoid downtime.
  await confirm("Ready to proceed with DNS update?");
  await updateRecordsInHostedZone(route53Client, hostedZoneId, {
    Changes: changes,
  });

  logger.info("Operation completed");
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
    Adds DNS records (A, TXT) to the regional domain account
    usage example: npx ts-node addHostingZoneDnsRecords --stage prod --region ap-northeast-3`
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command. e.g. us-west-2",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  await addRecords(stage as Stage, region as Region);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
