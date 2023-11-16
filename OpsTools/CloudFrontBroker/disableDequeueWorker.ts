import yargs from "yargs";
import {
  CloudWatchEventsClient,
  ListRulesCommand,
  EnableRuleCommand,
  DisableRuleCommand,
} from "@aws-sdk/client-cloudwatch-events";

import {
  Region,
  Stage,
  StandardRoles,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "Commons/Isengard";
import logger from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `

      Usage:

      npx ts-node OpsTools/CloudFrontBroker/disableDequeueWorker.ts --stage prod --region us-west-2
      `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2, pdx, PDX",
      type: "string",
      demandOption: true,
    })
    .option("enable", {
      describe: "When passed the rule is enabled instead of disabled.",
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region) as Region;
  const { enable: enableRule } = args;

  const account = await controlPlaneAccount(stage, region);

  await preflightCAZ({ accounts: account, role: StandardRoles.OncallOperator });

  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    StandardRoles.OncallOperator
  );

  const client = new CloudWatchEventsClient({
    region,
    credentials,
  });

  const res = await client.send(
    new ListRulesCommand({
      NamePrefix: "AWSAmplifyCloudFrontBroke-CloudFrontBrokerDequeue",
    })
  );

  if (res.Rules?.length !== 1) {
    logger.error(res.Rules, "Too many/few rules found.");
    throw new Error("Too many rules");
  }

  const ruleName = res.Rules[0].Name;
  if (!ruleName) {
    throw new Error("Could not get rule ARN");
  }

  if (enableRule) {
    const res = await client.send(
      new EnableRuleCommand({
        Name: ruleName,
      })
    );

    logger.info(res, "Rule enabled");
  } else {
    const res = await client.send(
      new DisableRuleCommand({
        Name: ruleName,
      })
    );
    logger.info(res, "Rule disabled");
  }
}

main().catch((err) => {
  logger.error(err, "Command execution failed");
  process.exit(1);
});
