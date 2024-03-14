import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  meteringAccount,
  preflightCAZ,
  Region,
  Stage,
} from "Commons/Isengard";
import { SQS } from "@aws-sdk/client-sqs";
import { getQueueUrl, getSourceQueueUrl, toArn } from "Commons/utils/sqs";
import log from "../../Commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ,
  IDEMPOTENT_ASYNC_TASK_METERING_DLQ,
  SAFE_TO_REDRIVE_QUEUES,
} from "./queuesClassification";
import { toRegionName } from "Commons/utils/regions";
import sleep from "Commons/utils/sleep";

async function getSqs(account: AmplifyAccount) {
  const role = "OncallOperator";
  await preflightCAZ({ accounts: account, role });
  const credentials = getIsengardCredentialsProvider(account.accountId, role);

  return new SQS({
    region: account.region,
    credentials,
  });
}

async function getMessageCount(sqs: SQS, dlqUrl: string) {
  const approximateNumberOfMessages = "ApproximateNumberOfMessages";
  const dlqAttributes = await sqs.getQueueAttributes({
    QueueUrl: dlqUrl,
    AttributeNames: [approximateNumberOfMessages],
  });

  return parseInt(
    dlqAttributes.Attributes?.[approximateNumberOfMessages] ?? ""
  );
}

async function startRedriveTask(
  sqs: SQS,
  dlqArn: string,
  sourceQueueArn: string
) {
  log.info(`Redriving messages from ${dlqArn} to ${sourceQueueArn}`);

  // Though unintuitive, the DLQ is the message source, and the source queue is the message destination
  const messageMoveTask = await sqs.startMessageMoveTask({
    SourceArn: dlqArn,
    DestinationArn: sourceQueueArn,
  });
  const taskHandle = messageMoveTask.TaskHandle ?? "";

  log.info(`Started redrive task with handle: ${taskHandle}`);
  return taskHandle;
}

async function waitForRedriveTaskToComplete(
  sqs: SQS,
  dlqArn: string,
  taskHandle: string
) {
  for (let i = 0; i < 120; i++) {
    await sleep(5000);

    const messageMoveTasks = await sqs.listMessageMoveTasks({
      SourceArn: dlqArn,
    });
    const messageMoveTask = messageMoveTasks.Results?.filter(
      (task) => task.TaskHandle === taskHandle
    )[0];
    const status = messageMoveTask?.Status;

    switch (status) {
      case "COMPLETED":
        log.info(`All messages were redriven successfully.`);
        return;
      case "CANCELLED":
        throw new Error("Redrive task was cancelled.");
      case "FAILED":
        throw new Error(
          `Redrive task failed: ${messageMoveTask?.FailureReason}`
        );
      default: // RUNNING or CANCELLING
        log.info(`Redrive task status: ${status}`);
    }
  }

  throw new Error(
    `Redrive task is taking a while - continue to monitor in the console.\nDLQ: ${dlqArn}\nTask handle: ${taskHandle}`
  );
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Redrives messages from DLQs to the corresponding source queue.
        
        Example:
        $ bb redrive -- --stage beta --region pdx --dlq AccountClosingDLQ
        `
    )
    .option("stage", {
      describe: "The stage in which to redrive",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: `The region in which to redrive (e.g. "pdx", "PDX", "us-west-2"`,
      type: "string",
      demandOption: true,
    })
    .option("dlq", {
      describe: "The prefix of the DLQ to redrive",
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
      `${dlq} is not in the list of safe-to-redrive DLQs: ${SAFE_TO_REDRIVE_QUEUES}`
    );
  }

  let account;
  if (IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ.includes(dlq)) {
    account = await controlPlaneAccount(stage as Stage, region as Region);
  } else if (IDEMPOTENT_ASYNC_TASK_METERING_DLQ.includes(dlq)) {
    account = await meteringAccount(stage as Stage, region as Region);
    dlq = `${stage}-${toRegionName(region)}-${dlq}`; // Metering queues need the stage and region to be prepended
  } else {
    throw new Error(`DLQ ${dlq} not found in existing accounts.`);
  }

  const sqs = await getSqs(account);

  const dlqUrl = await getQueueUrl(sqs, dlq);
  const dlqArn = toArn(dlqUrl);
  const sourceQueueArn = toArn(await getSourceQueueUrl(sqs, dlqUrl));

  const messageCount = await getMessageCount(sqs, dlqUrl);
  if (messageCount > 0) {
    log.info(`Found ${messageCount} messages to redrive.`);
    const taskHandle = await startRedriveTask(sqs, dlqArn, sourceQueueArn);
    await waitForRedriveTaskToComplete(sqs, dlqArn, taskHandle);
  } else {
    log.warn(`No messages found in ${dlqUrl}.`);
  }
}

main().catch(console.error);
