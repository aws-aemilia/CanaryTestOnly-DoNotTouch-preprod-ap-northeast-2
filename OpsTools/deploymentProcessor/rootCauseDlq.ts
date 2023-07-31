import yargs from "yargs";
import fs from "fs";
import logger from "../../Commons/utils/logger";
import {
  SFNClient,
  DescribeExecutionCommand,
  DescribeExecutionCommandOutput,
} from "@aws-sdk/client-sfn";
import { pollMessages } from "../../Commons/utils/sqs";
import { doQuery } from "../../Commons/libs/CloudWatch";
import {
  AmplifyAccount,
  Region,
  Stage,
  computeServiceControlPlaneAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { DeleteMessageCommand, SQSClient, Message } from "@aws-sdk/client-sqs";
import { toRegionName } from "../../Commons/utils/regions";
import { findJob } from "../../Commons/dynamodb/tables/job";
import { findDeployment } from "../../Commons/dynamodb/tables/computeDeployments";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import dayjs from "dayjs";

interface DLQMessage {
  receiptHandle: string;
  sentTimestamp: number;
  payload: DLQMessagePayload;
  rootCause: RootCause | null;
}

interface DLQMessagePayload {
  accountId: string;
  applicationId: string;
  buildId: string;
  branch: string;
  branchArn: string;
  taskArn: string;
  branchDisplayName: string;
  isSsr: string;
  meteringJobId: string;
  framework: string;
  platform: "WEB" | "WEB_DYNAMIC" | "WEB_COMPUTE";
  s3ManualDeployZipKey: string;
  s3ZipBucket: string;
}

// RootCause is of type `any` to give us flexibility to put whatever we want.
// A string, a stack trace (list of strings), an object, etc. The root cause
// gets JSON stringified at the end so it doesn't matter what type it is.
type RootCause = any;

interface StateMachineFailureCause {
  errorMessage: string;
  errorType: string;
  stackTrace: string[];
  cause?: StateMachineFailureCause;
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Reads messages from DeploymentProcessor DLQ and root causes them. It writes the results " +
        "to a file along with the original DLQ messages.\n\n" +
        "Example usage:\n" +
        "npx ts-node rootCauseDlq.ts --stage prod --region yul --ticket V882665398 --outputPath ~/Desktop/dlq.yul.txt" +
        "npx ts-node rootCauseDlq.ts --stage prod --region fra --ticket V884604671 --outputPath ~/Desktop/dlq.fra.txt --deleteMessages"
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
    .option("outputPath", {
      describe:
        "Path of a file where to write the results and DLQ messages (i.e. ~/Desktop/yul.txt)",
      type: "string",
      demandOption: true,
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

  const { region, stage, ticket, outputPath, deleteMessages } = args;
  process.env.ISENGARD_SIM = ticket;

  const regionName = toRegionName(region);
  const cpAccount = await controlPlaneAccount(stage as Stage, region as Region);
  const computeServiceAccount = await computeServiceControlPlaneAccount(
    stage as Stage,
    region as Region
  );

  const controlPlaneCreds = getIsengardCredentialsProvider(
    cpAccount.accountId,
    "OncallOperator"
  );

  const computeCreds = getIsengardCredentialsProvider(
    computeServiceAccount.accountId,
    "OncallOperator"
  );

  const sqsClient = new SQSClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  const dynamoDB = new DynamoDBClient({
    region: regionName,
    credentials: controlPlaneCreds,
  });

  const computeDynamoDB = new DynamoDBClient({
    region: regionName,
    credentials: computeCreds,
  });

  const computeSfnClient = new SFNClient({
    region: regionName,
    credentials: computeCreds,
  });

  const computeDocumentClient = DynamoDBDocumentClient.from(computeDynamoDB);
  const documentClient = DynamoDBDocumentClient.from(dynamoDB);
  const queueUrl = `https://sqs.${regionName}.amazonaws.com/${cpAccount.accountId}/DeploymentServiceDLQ`;

  // Poll for messages
  logger.info(`Polling messages from ${queueUrl}`);
  const sqsMessages = await pollMessages(sqsClient, queueUrl);

  logger.info(`Found ${sqsMessages.length} messages`);
  for (const sqsMessage of sqsMessages) {
    const message = parseMessage(sqsMessage);
    if (!message) {
      logger.error(
        sqsMessage,
        "Failed to parse SQS message. Unable to root cause"
      );
      continue;
    }

    logger.info(
      `This was a ${
        message.payload.platform ? message.payload.platform : "Manual"
      } deployment`
    );

    if (message.payload.platform === "WEB_COMPUTE") {
      // Attempt to find root cause in compute service
      let computeServiceRootCause = await rootCauseComputeDeployment(
        computeDocumentClient,
        computeSfnClient,
        message
      );

      // But also check deployment processor to have full picture of what happened
      logger.info("Looking for error in deployment processor");
      let deploymentProcessorRootCause = await rootCauseDeployment(
        documentClient,
        stage,
        regionName,
        message,
        cpAccount
      );

      if (!computeServiceRootCause && !deploymentProcessorRootCause) {
        // No root cause found anywhere. 
        message.rootCause = null;
        return;
      }

      message.rootCause = [];

      if (deploymentProcessorRootCause) {
        // Add the root cause from deployment processor
        message.rootCause.push(...deploymentProcessorRootCause);
      }

      if (computeServiceRootCause) {
        // Add the root cause from compute service
        message.rootCause.push(...computeServiceRootCause);
      }

    } else {
      message.rootCause = await rootCauseDeployment(
        documentClient,
        stage,
        regionName,
        message,
        cpAccount
      );
    }

    if (message.rootCause) {
      writeRootCauseToOutputFile(message, outputPath);
      if (deleteMessages) {
        await deleteMessage(sqsClient, queueUrl, message);
      }
    } else {
      logger.error(message, "Unable to find root cause for message");
    }
  }
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

function writeRootCauseToOutputFile(message: DLQMessage, outputPath: string) {
  const output = [];
  output.push("====================");
  output.push(JSON.stringify(message, null, 2));
  output.push("====================");
  logger.info(`Writing root cause to output file ${outputPath}`);
  fs.appendFileSync(outputPath, output.join("\n"));
}

function parseMessage(sqsMessage: Message): DLQMessage | null {
  logger.info(`Parsing message ${sqsMessage.MessageId}`);
  const payload = JSON.parse(sqsMessage.Body as string) as DLQMessagePayload;

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

async function rootCauseDeployment(
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  message: DLQMessage,
  controlPlaneAccount: AmplifyAccount
): Promise<RootCause | null> {
  // Lookup Job in DynamoDB
  const job = await findJob(
    documentClient,
    stage,
    region,
    message.payload.branchArn,
    message.payload.buildId
  );

  let deploymentStartTime: Date;
  let deploymentEndTime: Date;

  if (job) {
    // Find the deployment step in the JobDO
    const deploymentStep = job.jobSteps.find((step) => step.name === "DEPLOY");
    if (!deploymentStep) {
      logger.error(
          message,
          "Unable to find deployment step in job. Cannot root cause"
      );
      return null;
    }

    logger.info(deploymentStep, "Found deployment step in JobDO");
    deploymentStartTime = new Date(deploymentStep.startTime);
    deploymentEndTime = dayjs(deploymentStep.endTime).add(1, "minute").toDate(); // logs are sometimes after deployment end time. Not sure why

  } else {
    logger.warn(message, "Unable to find job in DynamoDB. Branch was likely deleted");
    // Since job was deleted, we will assume deployment start time and end time based on the SQS message
    deploymentStartTime = new Date(message.sentTimestamp);
    deploymentEndTime = dayjs(message.sentTimestamp).add(10, "minute").toDate();
  }

  logger.info("Querying for errors in Deployment Processor logs");

  const logs = await doQuery(
    controlPlaneAccount,
    "AmplifyDeploymentService-ECSSERVICE-ServiceQueueProcessingTaskDef",
    `filter @message like /Fatal error/ and @message like /${message.payload.applicationId}/ | fields @timestamp, @message`,
    deploymentStartTime,
    deploymentEndTime,
  );

  if (!logs) {
    logger.error(
      message,
      "Unable to find errors in Deployment Processor logs. Cannot root cause"
    );
    return null;
  }

  logger.info(`Found ${logs.length} logs with errors`);
  return logs;
}

async function rootCauseComputeDeployment(
  documentClient: DynamoDBDocumentClient,
  stepFunctionsClient: SFNClient,
  message: DLQMessage
): Promise<RootCause | null> {
  const computeDeployment = await findDeployment(
    documentClient,
    message.payload.branchArn,
    message.payload.buildId
  );

  if (!computeDeployment) {
    logger.error(
      message,
      "Deployment not found in DynamoDB. Unable to root cause"
    );
    return null;
  }

  if (!computeDeployment.stateMachineExecutionArn) {
    logger.info(
      computeDeployment,
      "Compute deployment is missing stateMachineExecutionArn. This is not expected"
    );
    return null;
  }

  logger.info("Checking deployer state machine execution details = %s", computeDeployment.stateMachineExecutionArn);
  const response = await stepFunctionsClient.send(
    new DescribeExecutionCommand({
      executionArn: computeDeployment.stateMachineExecutionArn,
    })
  );

  logger.info(response, "State machine execution");

  if (response.status !== "FAILED") {
    logger.info(response, "State machine execution is not in failed state");
    logger.info("Deployment did not fail in compute service");
    return null;
  }

  const errorMessages = extractErrorsFromStateMachineExecution(response);
  if (errorMessages.length === 0) {
    logger.error("No root cause found in deployer state machine");
    return null;
  }

  logger.info("Found root cause successfully");
  return errorMessages;
}

function extractErrorsFromStateMachineExecution(
  execution: DescribeExecutionCommandOutput
): string[] {
  let failureCause: StateMachineFailureCause;

  if (!execution.cause) {
    logger.info(
      execution,
      "State machine execution is missing a failure cause"
    );
    return [];
  }

  try {
    // Check if the cause is a parseable object that contains a stack trace and errorType.
    failureCause = JSON.parse(
      execution.cause as string
    ) as StateMachineFailureCause;
  } catch (err) {
    // If it's not parseable, it means it is a plain string.
    return [execution.cause as string];
  }

  // Recurse through the stack trace of failure causes to find the root cause
  let errorMessages = [];
  let currentCause = failureCause.cause;
  while (currentCause) {
    const { errorType, errorMessage } = currentCause;
    errorMessages.push(`${errorType}: ${errorMessage}`);
    currentCause = currentCause.cause;
  }

  return errorMessages;
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
