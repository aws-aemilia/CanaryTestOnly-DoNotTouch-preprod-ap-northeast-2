import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Commons/Isengard";
import {
  DeleteMessageCommand,
  SendMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import {
  getQueueUrl,
  getSourceQueueUrl,
  pollMessages,
  prettyPrint,
} from "../../Commons/utils/sqs";
import log from "../../Commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SAFE_TO_REDRIVE_QUEUES } from "./queuesClassification";

async function redrive(account: AmplifyAccount, dlq: string) {
  const sqsClient = new SQSClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  const dlqUrl = await getQueueUrl(sqsClient, dlq);
  const sourceQueueUrl = await getSourceQueueUrl(sqsClient, dlqUrl);

  log.info(`Redriving messages from ${dlqUrl} to ${sourceQueueUrl}`);

  const messages = await pollMessages(sqsClient, dlqUrl);
  log.info(`Found ${messages.length} messages in ${dlqUrl}`);

  for (const message of messages) {
    log.info(`Redriving message: ${prettyPrint(message)}`);
    // Send the message to the main queue
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: sourceQueueUrl,
        MessageBody: message.Body,
      })
    );
    // Delete the message from the DLQ
    await sqsClient.send(
      new DeleteMessageCommand({
        QueueUrl: dlqUrl,
        ReceiptHandle: message.ReceiptHandle,
      })
    );
  }

  log.info(`All ${messages.length} messages were redriven successfully`);
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Redrives messages from DLQs to the corresponding source queue 
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
      choices: SAFE_TO_REDRIVE_QUEUES,
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, dlq } = args;

  if (!SAFE_TO_REDRIVE_QUEUES.includes(dlq)) {
    throw new Error(
      `It is not safe to redrive messages from ${dlq}. Please check the SAFE_TO_REDRIVE_QUEUES constant`
    );
  }

  process.env.ISENGARD_SIM = ticket;

  await redrive(
    await controlPlaneAccount(stage as Stage, region as Region),
    dlq
  );
}

main().then(console.log).catch(console.error);
