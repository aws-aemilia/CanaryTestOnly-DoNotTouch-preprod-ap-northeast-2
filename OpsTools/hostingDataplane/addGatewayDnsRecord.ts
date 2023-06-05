import { dataPlaneAccount, Region, Stage } from "../../Isengard";
import yargs from "yargs";
import { getCloudFormationOutputs } from "../../utils/cloudFormation";
import { getDomainName, HOSTED_ZONE_ID } from "./utils/utils";
import { getRoute53Client, updateRecordsInHostedZone } from "../../route53";
import { ChangeBatch } from "aws-sdk/clients/route53";

require("util").inspect.defaultOptions.depth = null;

const addRecord = async (stage: Stage, region: Region) => {
  const account = await dataPlaneAccount(
    stage,
    region
  );
  const stackName = `HostingGateway-${stage}`;
  const outputs = await getCloudFormationOutputs({
    amplifyAccount: account,
    outputKeys: ["ALB", "HostingGatewayLoadBalancerCanonicalHostedZoneId"],
    stackName: stackName,
  });

  const { ALB, HostingGatewayLoadBalancerCanonicalHostedZoneId } = outputs;
  if (!ALB || !HostingGatewayLoadBalancerCanonicalHostedZoneId) {
    throw new Error(
      `The ALB or HostingGatewayLoadBalancerCanonicalHostedZoneId CFN outputs were not found in stack ${stackName}`
    );
  }
  const changeBatch: ChangeBatch = {
    Changes: [
      {
        Action: "CREATE",
        ResourceRecordSet: {
          Type: "A",
          Name: getDomainName(stage, region),
          AliasTarget: {
            DNSName: ALB,
            HostedZoneId: HostingGatewayLoadBalancerCanonicalHostedZoneId,
            EvaluateTargetHealth: true,
          },
        },
      },
    ],
    Comment: "Add cell gateway A record",
  };

  const route53Client = getRoute53Client(stage);
  await updateRecordsInHostedZone(route53Client, HOSTED_ZONE_ID, changeBatch);
  console.log("SUCCESS");
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
Adds an A record that points the cell subdomain to the gateway ALB url`
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

  await addRecord(stage as Stage, region as Region);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
