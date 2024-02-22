import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
} from "Commons/Isengard";
import {
  EnableEnhancedMonitoringCommand,
  KinesisClient,
} from "@aws-sdk/client-kinesis";
import log from "Commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const CLOUDFRONT_DISTRIBUTION_LOGS_STREAM_NAME = "CloudFrontDistributionLogs";

async function enableShardLevelMetrics(account: AmplifyAccount) {
  const kinesisClient = new KinesisClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  log.info(`Enabling shard level metrics in: ${account.region} `);
  await kinesisClient.send(
    new EnableEnhancedMonitoringCommand({
      StreamName: CLOUDFRONT_DISTRIBUTION_LOGS_STREAM_NAME,
      ShardLevelMetrics: ["ALL"],
    })
  );
  log.info(`Shard level metrics has been enabled in ${account.region}`);
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Enable shard level metric for CloudFrontDistribtionLogs data stream in all regions 
        ts-node enableShardLevelMetrics.ts --stage beta
      `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage } = args;

  const accounts = await controlPlaneAccounts({ stage: stage as Stage });
  await preflightCAZ({ accounts: accounts, role: "OncallOperator" });

  for (let account of accounts) {
    await enableShardLevelMetrics(account);
  }
}

main().then(console.log).catch(console.error);
