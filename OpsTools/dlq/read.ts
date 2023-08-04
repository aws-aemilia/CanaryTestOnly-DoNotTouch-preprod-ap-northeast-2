import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
} from "../../Commons/Isengard";
import { SQSClient } from "@aws-sdk/client-sqs";
import {
  getQueueUrl,
  pollMessages,
  prettyPrint,
} from "../../Commons/utils/sqs";
import log from "../../Commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SAFE_TO_READ_QUEUES } from "./queuesClassification";

async function read(account: AmplifyAccount, dlq: string) {
  const sqsClient = new SQSClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  const dlqUrl = await getQueueUrl(sqsClient, dlq);
  const messages = await pollMessages(sqsClient, dlqUrl);

  log.info(`Found ${messages.length} messages in ${dlqUrl}`);
  messages.forEach((x) => log.info(prettyPrint(x)));
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Read messages from DLQs 
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
      choices: SAFE_TO_READ_QUEUES,
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, dlq } = args;

  if (!SAFE_TO_READ_QUEUES.includes(dlq)) {
    throw new Error(
      `It is not safe to read messages from ${dlq}. Please check the SAFE_TO_READ_QUEUES constant`
    );
  }

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  await preflightCAZ({accounts : account, role : "OncallOperator"});
  await read(account, dlq);
}

main().then(console.log).catch(console.error);
