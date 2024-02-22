import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
} from "Commons/Isengard";
import { PurgeQueueCommand, SQSClient } from "@aws-sdk/client-sqs";
import { getQueueUrl } from "Commons/utils/sqs";
import log from "Commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SAFE_TO_PURGE_QUEUES } from "./queuesClassification";

async function purge(account: AmplifyAccount, dlq: string) {
  const sqsClient = new SQSClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  const dlqUrl = await getQueueUrl(sqsClient, dlq);
  await sqsClient.send(new PurgeQueueCommand({ QueueUrl: dlqUrl }));
  log.info(`Successfully purged ${dlqUrl}`);
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Deletes all messages from a DLQ 
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("dlq", {
      describe: "dlq queue prefix",
      type: "string",
      choices: SAFE_TO_PURGE_QUEUES,
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, dlq } = args;

  if (!SAFE_TO_PURGE_QUEUES.includes(dlq)) {
    throw new Error(
      `It is not safe to delete messages from ${dlq}. Please check the SAFE_TO_PURGE_QUEUES constant`
    );
  }

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  await preflightCAZ({ accounts: account, role: "OncallOperator" });
  await purge(account, dlq);
}

main().then(console.log).catch(console.error);
