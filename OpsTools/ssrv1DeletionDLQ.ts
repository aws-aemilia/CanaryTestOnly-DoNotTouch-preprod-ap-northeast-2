import yargs from "yargs";
import fs from "fs";
import logger from "../commons/utils/logger";
import { pollMessages, getQueueUrl } from "../commons/utils/sqs";
import { insightsQuery } from "../commons/libs/CloudWatch";
import {
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../commons/Isengard";
import {
  SQSClient,
  Message,
  DeleteMessageCommand,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { toRegionName } from "../commons/utils/regions";
import dayjs from "dayjs";
import { createTicket } from "../commons/SimT/createTicket";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

/**
 * Script to handle DLQ messages from AsyncResourceDeletionDLQ for SSRv1 apps
 * that failed to be deleted due to a replication issue with Lambda@Edge.
 *
 * This script should no longer be necessary after this SIM ticket is resolved
 * by CloudFront: https://sim.amazon.com/issues/HOOK-4484. ECD is around mid June, 2023
 * according to https://t.corp.amazon.com/V891398764/communication.
 */

interface DLQMessage {
  receiptHandle: string;
  sentTimestamp: number;
  payload: DLQMessagePayload;
}

interface DLQMessagePayload {
  Type: "App" | "Branch";
  AppDO: {
    accountId: string;
    appId: string;
    name: string;
    platform: "WEB" | "WEB_DYNAMIC" | "WEB_COMPUTE";
  };
  BranchDO?: {
    appId: string;
    branchName: string;
    branchArn: string;
  };
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Reads messages from the AsyncResourceDeletionDLQ and if it finds one related 
      to the Lambda@Edge replication issue, it cuts a ticket to CloudFront so they 
      can cleanup the resources.

      Usage: 

      npx ts-node ssrv1DeletionDLQ.ts --stage prod \
        --region BOM \
        --ticket V0123456789

      If you're happy with the results, run it again with --deleteMessages
      and with --skipTicket so it doesn't duplicate the ticket to CloudFront.

      npx ts-node ssrv1DeletionDLQ.ts --stage prod \
        --region BOM \
        --ticket V0123456789 \
        --deleteMessages \
        --skipTicket
      `
    )
    .option("stage", {
      describe: "Stage to run the command in",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "Region to run the command in (i.e. PDX, us-east-1, etc)",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .option("output", {
      describe:
        "Path of a file where to write the DLQ messages (Defaults to ./${ticket}.txt)",
      type: "string",
      demandOption: false,
    })
    .option("skipTicket", {
      describe: "If provided, ticket will not be cut to CloudFront",
      type: "boolean",
      demandOption: false,
    })
    .option("deleteMessages", {
      describe:
        "If provided, messages with a root cause will be deleted from the DLQ",
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, skipTicket, deleteMessages, output } = args;
  process.env.ISENGARD_SIM = ticket;
  const outputFile = output ? output : `./${ticket}.txt`;

  const regionName = toRegionName(region);
  const cpAccount = await controlPlaneAccount(stage as Stage, region as Region);
  const controlPlaneCreds = getIsengardCredentialsProvider(
    cpAccount.accountId,
    "OncallOperator"
  );

  const sqsClient = new SQSClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  const cwClient = new CloudWatchLogsClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  // Poll for messages
  logger.info("Searching DLQ URL");
  const queueUrl = await getQueueUrl(
    sqsClient,
    "AemiliaControlPlaneLambda-AsyncResourceDeletionDLQ"
  );

  // Get source queue
  logger.info("Searching for Async Deletion queue");
  const sourceQueueUrl = await getQueueUrl(
    sqsClient,
    "AemiliaControlPlaneLambda-AsyncResourceDeletionQueue",
  );

  logger.info(`Polling messages from ${queueUrl}`);
  const sqsMessages = await pollMessages(sqsClient, queueUrl);

  logger.info(`Found ${sqsMessages.length} messages`);
  for (const sqsMessage of sqsMessages) {
    const message = parseMessage(sqsMessage);
    if (!message) {
      logger.error("Unable to parse message, skipping");
      continue;
    }

    if (message.payload.AppDO.platform !== "WEB_DYNAMIC") {
      logger.info("Skipping message. Non WEB_DYNAMIC app");
      continue;
    }

    // Query AsyncResourceDeletion Lambda logs from the time the message was sent
    // to 5 hours later. This is to account for the 10 retries with 30 minutes delay
    // in between each retry.

    const startDate = new Date(message.sentTimestamp);
    const endDate = dayjs(message.sentTimestamp).add(5, "hours").toDate();

    // Check if this is the known issue with replication delay for Lambda@Edge functions.
    // See ticket with CloudFront: https://t.corp.amazon.com/V891398764/communication

    const logs = await insightsQuery(
      cwClient,
      "/aws/lambda/AemiliaControlPlaneLambda-AsyncResourceDeletion",
        `parse @message 'Lambda was unable to delete * because it is a replicated function' as functionArn ` +
        `| filter ispresent(functionArn) and functionArn like '${message.payload.AppDO.accountId}'`,
      startDate,
      endDate
    );

    // If the previous query got results, and there are at least 10 log lines (attempts) to delete
    // the function. Then we found a case of an orphan Lambda@Edge function.
    if (logs.length > 0 && logs.length >= 10) {
      logger.info("Found orphan Lambda@Edge function");

      const anyLog = logs[0];
      if (!anyLog.functionArn) {
        logger.error("Unable to parse functionArn from log line");
        continue;
      }

      logger.info(`Orphan Lambda@Edge function ARN: ${anyLog.functionArn}`);
      writeToOutputFile(message, outputFile);

      if (!skipTicket) {
        await cutTicketToCloudFront(anyLog.functionArn);
      }

      if (deleteMessages) {
        await redriveMessage(sqsClient, sourceQueueUrl, message);
        await deleteMessage(sqsClient, queueUrl, message);
      }
    }
  }
}

function writeToOutputFile(message: DLQMessage, outputPath: string) {
  logger.info(`Writing message to output file ${outputPath}`);
  const output = [];
  output.push("====================");
  output.push(JSON.stringify(message, null, 2));
  output.push("====================");
  fs.appendFileSync(outputPath, output.join("\n"));
}

async function deleteMessage(
  sqsClient: SQSClient,
  queueUrl: string,
  message: DLQMessage
) {
  logger.info("Deleting message from DLQ");
  await sqsClient.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: message.receiptHandle,
    })
  );
}

async function cutTicketToCloudFront(functionArn: string) {
  logger.info("Cutting ticket to CloudFront");
  const ticket = await createTicket({
    title: "Cannot delete L@E function due to replication delay",
    description: `Hi, please assist with the cleanup of Lambda function ARN: ${functionArn} \n\nThank you. \nAmplify Hosting team`,
    assignedFolder: "8cac4c86-6a73-4026-93be-6b904bcce3de",
    extensions: {
      tt: {
        category: "AWS",
        type: "CloudFront Customer Issue/Limits",
        item: "Lambda@Edge",
        assignedGroup: "CloudFront-Compute",
        caseType: "",
        impact: 3,
      },
    },
  });

  logger.info(
    `Ticket created successfully https://t.corp.amazon.com/${ticket}`
  );
}

function parseMessage(sqsMessage: Message): DLQMessage | null {
  logger.info(`Parsing message ${sqsMessage.MessageId}`);
  const payload = JSON.parse(sqsMessage.Body as string);

  // Remove sensitive fields
  delete payload.AppDO?.clonePrivateKey;
  delete payload.AppDO?.buildSpec;
  delete payload.AppDO?.environmentVariables;

  // Extract message timestamp from attributes
  if (!sqsMessage.Attributes || !sqsMessage.Attributes.SentTimestamp) {
    logger.error(
      payload,
      "Message doesn't have a SentTimestamp attribute, unable to root cause"
    );

    return null;
  }

  return {
    receiptHandle: sqsMessage.ReceiptHandle as string,
    sentTimestamp: parseInt(sqsMessage.Attributes.SentTimestamp),
    payload,
  } as DLQMessage;
}

async function redriveMessage(
  sqsClient: SQSClient,
  sourceQueueUrl: string,
  message: DLQMessage
) {
  logger.info("Redriving message to queue", sourceQueueUrl);

  // Redrive the message as WEB instead of WEB_DYNAMIC so that SSR resources are
  // not attempted to be deleted again and cause it to fail. At this point, we just
  // for AsyncResourceDeletion to delete the non-SSR resources like BranchDO.
  const newMessage: DLQMessagePayload = {
    ...message.payload,
    AppDO: {
      ...message.payload.AppDO,
      platform: "WEB",
    }
  };

  const response = await sqsClient.send(
    new SendMessageCommand({
      DelaySeconds: 0,
      MessageBody: JSON.stringify(newMessage),
      QueueUrl: sourceQueueUrl,
    })
  );

  logger.info("Message redrived successfully", response.MessageId);
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
