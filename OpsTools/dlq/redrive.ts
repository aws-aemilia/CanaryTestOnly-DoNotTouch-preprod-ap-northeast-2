import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  meteringAccount,
  preflightCAZ,
  Region,
  Stage,
} from "../../Commons/Isengard";
import {
  DeleteMessageCommand,
  Message,
  SendMessageCommand,
  SendMessageCommandInput,
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
import {
  IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ,
  IDEMPOTENT_ASYNC_TASK_METERING_DLQ,
  SAFE_TO_REDRIVE_QUEUES,
} from "./queuesClassification";
import { toRegionName } from "../../Commons/utils/regions";

function constructSendMessageCommandInput(
  sourceQueueUrl: string,
  message: Message,
  dlqUrl: string
) {
  let input: SendMessageCommandInput = {
    QueueUrl: sourceQueueUrl,
    MessageBody: message.Body,
  };

  // FIFO queues require the MessageGroupId to be set: https://tiny.amazon.com/1hvjn2qcl
  if (dlqUrl.endsWith(".fifo")) {
    input = {
      ...input,
      MessageGroupId: JSON.parse(message.Body!).fifoMessageGroupId,
    };
  }
  return input;
}

async function redrive(account: AmplifyAccount, dlq: string) {
  const role = "OncallOperator";

  await preflightCAZ({ accounts: account, role });
  const sqsClient = new SQSClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId, role),
  });

  const dlqUrl = await getQueueUrl(sqsClient, dlq);
  const sourceQueueUrl = await getSourceQueueUrl(sqsClient, dlqUrl);

  log.info(`Redriving messages from ${dlqUrl} to ${sourceQueueUrl}`);

  const messages = await pollMessages(sqsClient, dlqUrl);
  log.info(`Found ${messages.length} messages in ${dlqUrl}`);

  for (const message of messages) {
    log.info(`Redriving message: ${prettyPrint(message)}`);

    // Send the message to the main queue
    let input = constructSendMessageCommandInput(
      sourceQueueUrl,
      message,
      dlqUrl
    );
    await sqsClient.send(new SendMessageCommand(input));

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
    .strict()
    .version(false)
    .help().argv;

  let { region, stage, dlq } = args;

  if (!SAFE_TO_REDRIVE_QUEUES.includes(dlq)) {
    throw new Error(
      `It is not safe to redrive messages from ${dlq}. Please check the SAFE_TO_REDRIVE_QUEUES constant`
    );
  }

  let account: AmplifyAccount;
  if (IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ.includes(dlq)) {
    account = await controlPlaneAccount(stage as Stage, region as Region);
  } else if (IDEMPOTENT_ASYNC_TASK_METERING_DLQ) {
    account = await meteringAccount(stage as Stage, region as Region);
    dlq = `${stage}-${toRegionName(region)}-${dlq}`; // Metering queues need the stage and region to be prepended
  } else {
    throw new Error(`DLQ ${dlq} not found in existing accounts.`);
  }

  await redrive(account, dlq);
}

main().then(console.log).catch(console.error);
