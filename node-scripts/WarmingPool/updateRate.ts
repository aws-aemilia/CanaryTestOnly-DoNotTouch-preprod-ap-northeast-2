import {
  CloudWatchEventsClient,
  DescribeRuleCommand,
  ListRulesCommand,
  PutRuleCommand,
  PutRuleCommandInput,
} from "@aws-sdk/client-cloudwatch-events";
import yargs from "yargs";
import {
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../Isengard";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(`
    Updates the teigger rate for Warming Pool events
    ts-node updateRate.ts --region="us-east-2" --stage="prod" --ticket="V874802994"`)
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      default: "us-west-2",
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    "OncallOperator"
  );

  const client = new CloudWatchEventsClient({
    region,
    credentials,
  });
  const res = await client.send(new ListRulesCommand({ Limit: 100 }));
  console.log(`fetched rules  ${res.Rules!.length}}`);

  for (const rule of res.Rules!) {
    if (
      rule.State === "ENABLED" &&
      rule.Name?.includes("TransitionToCertVerifyRule")
    ) {
      console.log(`Updating rule: ${rule.Name}`);

      let describeRuleRes = await client.send(
        new DescribeRuleCommand({ Name: rule.Name })
      );

      console.log(describeRuleRes);

      describeRuleRes.ScheduleExpression = "rate(2 minutes)";

      const res = await client.send(
        new PutRuleCommand(describeRuleRes as PutRuleCommandInput)
      );
      console.log(JSON.stringify(res));
    }
  }
  process.exit(0);
};

main()
  .then()
  .catch((e) => console.error(e));
