import { computeServiceDataPlaneAccount, Region, Stage } from "../../Isengard";
import yargs from "yargs";
import { getCloudFormationOutputs } from "../../utils/cloudFormation";
import { getDomainName } from "./utils/utils";
import { changeResourceRecordSetsInGlobalAccount } from "./utils/route53";
import { ChangeBatch } from "aws-sdk/clients/route53";

require("util").inspect.defaultOptions.depth = null;

const addRecord = async (stage: Stage, region: Region, cellNumber: number) => {
  const cellAccount = await computeServiceDataPlaneAccount(
    stage,
    region,
    cellNumber
  );
  const stackName = `ComputeServiceCellGateway-${stage}`;
  const outputs = await getCloudFormationOutputs({
    amplifyAccount: cellAccount,
    outputKeys: ["ALB", "CellGatewayLoadBalancerCanonicalHostedZoneId"],
    stackName: stackName,
  });

  const { ALB, CellGatewayLoadBalancerCanonicalHostedZoneId } = outputs;
  if (!ALB || !CellGatewayLoadBalancerCanonicalHostedZoneId) {
    throw new Error(
      `The ALB or CellGatewayLoadBalancerCanonicalHostedZoneId CFN outputs were not found in stack ${stackName}`
    );
  }
  const changeBatch: ChangeBatch = {
    Changes: [
      {
        Action: "CREATE",
        ResourceRecordSet: {
          Type: "A",
          Name: getDomainName(stage, region, cellNumber),
          AliasTarget: {
            DNSName: ALB,
            HostedZoneId: CellGatewayLoadBalancerCanonicalHostedZoneId,
            EvaluateTargetHealth: true,
          },
        },
      },
    ],
    Comment: "Add cell gateway A record",
  };

  await changeResourceRecordSetsInGlobalAccount(changeBatch);
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
    .option("cellNumber", {
      describe: "cell number. e.g. 1",
      type: "number",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, cellNumber } = args;

  await addRecord(stage as Stage, region as Region, cellNumber);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
