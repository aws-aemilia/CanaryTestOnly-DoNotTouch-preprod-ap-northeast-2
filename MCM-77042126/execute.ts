import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "../utils/regions";
import { getCloudFormationOutputs } from "../utils/cloudFormation";
import { rollbackRecords } from "./rollback";
import { verifyRecords } from "./verify";
import { precheckALBs } from "./precheck";
import { CloudFormationOutputs } from "./types";
import logger from "../utils/logger";
import confirm from "../utils/confirm";
import {
  Stage,
  Region,
  domainAccount,
  getIsengardCredentialsProvider,
  dataPlaneAccount,
  AmplifyAccount,
} from "../Isengard";
import {
  ResourceRecordSet,
  ChangeAction,
  Route53Client,
} from "@aws-sdk/client-route-53";
import {
  updateRecordsInHostedZone,
  getRecordsFromHostedZone,
  getHostedZone,
} from "../route53";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      "Replaces the Gateway A record that points to the ALB, with 2 new weighted " +
        "records pointing to the new ALB shards. This is a one-time tool for an MCM.\n\n" +
        "Example usages: \n" +
        "npx ts-node execute.ts --stage beta --region pdx --mcm MCM-532339 \n" +
        "npx ts-node execute.ts --stage beta --region pdx --mcm MCM-532339 --verify \n" +
        "npx ts-node execute.ts --stage beta --region pdx --mcm MCM-532339 --rollback \n" +
        "npx ts-node execute.ts --stage beta --region pdx --mcm MCM-532339 --precheck \n"
    )
    .option("region", {
      describe: `Region to execute (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
      demandOption: true,
    })
    .option("stage", {
      describe: `Stage to execute (e.g. "beta", "gamma", "prod").`,
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
      describe: `Run it in rollback mode to revert the records`,
      type: "boolean",
      demandOption: false,
    })
    .option("verify", {
      describe: `Run the verification to ensure records got created properly`,
      type: "boolean",
      demandOption: false,
    })
    .option("precheck", {
      describe: `Run the precheck to ensure new ALBs work properly`,
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, mcm, rollback, verify, precheck } = args;
  const stage = args.stage as Stage;
  const regionName = toRegionName(region);
  const gatewayRootDomain = `${stage}.${regionName}.gateway.amplify.aws.dev`;
  process.env.ISENGARD_MCM = mcm;

  // Initialize route53 clients for central domain account
  const centralDomainAccount = await domainAccount(stage, region as Region);
  const route53Client = new Route53Client({
    region: "us-east-1", // Route53 is global
    credentials: getIsengardCredentialsProvider(
      centralDomainAccount.accountId,
      "Route53Manager"
    ),
  });

  // Fetch the hostname and hostedZone values for the ALBs in the Gateway account.
  // This includes both the current ALB and the new ALB shards.
  const gatewayAccount = await dataPlaneAccount(stage, region as Region);
  const stackName = `HostingGateway-${stage}`;
  const outputs = await getAndValidateCFNOutputs(gatewayAccount, stackName);

  // Fetch the Hosted Zone Id from the central domain account.
  // This is where we will update records from.
  const hostedZoneId = await getGatewayHostedZone(
    route53Client,
    gatewayRootDomain
  );

  if (precheck) {
    return precheckALBs(stage, regionName, outputs);
  }

  if (verify) {
    return verifyRecords(
      route53Client,
      gatewayRootDomain,
      hostedZoneId,
      outputs
    );
  }

  if (rollback) {
    return rollbackRecords(
      route53Client,
      gatewayRootDomain,
      hostedZoneId,
      outputs
    );
  }

  // Get the A record from the Hosted Zone that points to the current ALB,
  // this record will be deleted and replaced with 2 new records.
  logger.info("Finding existing A record that points to the current ALB");
  const currentALBRecord = await getCurrentALBRecord(
    route53Client,
    hostedZoneId,
    gatewayRootDomain,
    outputs.HostingGatewayLoadBalancerDnsName
  );

  const changes = [
    {
      Action: ChangeAction.DELETE,
      ResourceRecordSet: {
        Name: currentALBRecord.Name,
        Type: currentALBRecord.Type,
        SetIdentifier: currentALBRecord.SetIdentifier,
        AliasTarget: currentALBRecord.AliasTarget,
      },
    },
    {
      Action: ChangeAction.CREATE,
      ResourceRecordSet: {
        Name: gatewayRootDomain,
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
        Name: gatewayRootDomain,
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
  ];

  logger.info(changes, "The following DNS changes will be applied");

  // Perform the Route53 BatchChangeRequest. We need to perform the removal of the
  // existing record and the addition of the new ones in the same batch to avoid downtime.
  await confirm("Ready to proceed with DNS update?");
  await updateRecordsInHostedZone(route53Client, hostedZoneId, {
    Changes: changes,
  });

  logger.info("Operation completed");
}

async function getCurrentALBRecord(
  route53Client: Route53Client,
  hostedZoneId: string,
  gatewayRootDomain: string,
  currentALBHostName: string
): Promise<ResourceRecordSet> {
  const records = await getRecordsFromHostedZone(
    route53Client,
    hostedZoneId,
    gatewayRootDomain,
    "A"
  );

  if (!records || records.length === 0) {
    logger.error("No A records found in hosted zone. This is not expected.");
    throw new Error("Failed preconditions");
  }

  if (records.length > 1) {
    logger.error("More than one A record. This is not expected.");
    throw new Error("Failed preconditions");
  }

  const currentALBRecord = records.find((r) => {
    return (
      r.Name === `${gatewayRootDomain}.` &&
      r.Type === "A" &&
      r.AliasTarget &&
      r.AliasTarget.DNSName === `${currentALBHostName.toLocaleLowerCase()}.`
    );
  });

  if (!currentALBRecord) {
    logger.error(records, "Could not find the current ALB record");
    throw new Error("Failed preconditions");
  }

  return currentALBRecord;
}

async function getGatewayHostedZone(
  route53Client: Route53Client,
  gatewayRootDomain: string
): Promise<string> {
  const hostedZone = await getHostedZone(route53Client, gatewayRootDomain);
  if (!hostedZone) {
    throw new Error(`Could not find hosted zone for ${gatewayRootDomain}`);
  }

  return hostedZone.Id as string;
}

async function getAndValidateCFNOutputs(
  gatewayAccount: AmplifyAccount,
  stackName: string
): Promise<CloudFormationOutputs> {
  logger.info("Fetching ALB configuration from CloudFormation");
  const outputs = await getCloudFormationOutputs({
    amplifyAccount: gatewayAccount,
    stackName: stackName,
    outputKeys: [
      "HostingGatewayLoadBalancerDnsName",
      "HostingGatewayLoadBalancerCanonicalHostedZoneId",
      "HostingGatewayALBShard1DNS",
      "HostingGatewayALBShard1HostedZoneId",
      "HostingGatewayALBShard2DNS",
      "HostingGatewayALBShard2HostedZoneId",
    ],
  });

  if (
    // Validate that all outputs are present and not empty
    isEmpty(outputs.HostingGatewayLoadBalancerDnsName) ||
    isEmpty(outputs.HostingGatewayLoadBalancerCanonicalHostedZoneId) ||
    isEmpty(outputs.HostingGatewayALBShard1DNS) ||
    isEmpty(outputs.HostingGatewayALBShard1HostedZoneId) ||
    isEmpty(outputs.HostingGatewayALBShard2DNS) ||
    isEmpty(outputs.HostingGatewayALBShard2HostedZoneId)
  ) {
    logger.error({ ...outputs });
    throw new Error("Could not find expected outputs from CloudFormation");
  }

  logger.info({ ...outputs }, "Found expected ALB configurations");
  return {
    HostingGatewayLoadBalancerDnsName:
      outputs.HostingGatewayLoadBalancerDnsName,
    HostingGatewayLoadBalancerCanonicalHostedZoneId:
      outputs.HostingGatewayLoadBalancerCanonicalHostedZoneId,
    HostingGatewayALBShard1DNS: outputs.HostingGatewayALBShard1DNS,
    HostingGatewayALBShard1HostedZoneId:
      outputs.HostingGatewayALBShard1HostedZoneId,
    HostingGatewayALBShard2DNS: outputs.HostingGatewayALBShard2DNS,
    HostingGatewayALBShard2HostedZoneId:
      outputs.HostingGatewayALBShard2HostedZoneId,
  };
}

function isEmpty(value: any): boolean {
  return value === undefined || value === null || value === "";
}

main()
  .catch((err) => logger.error(err))
  .then(() => logger.info("Done"));
