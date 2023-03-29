import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";

const logger = pino(pinoPretty());

export const sendMessage = async (
  account: AmplifyAccount,
  queueUrl: string,
  messageBody: string,
  role: string
): Promise<void> => {
  try {
    const sqsClient = new SQSClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(account.accountId, role),
    });

    const sendMessageCommand = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
    });

    logger.info(`sending SQS message: `, sendMessageCommand.input);

    const sendMessageCommandOutput = await sqsClient.send(sendMessageCommand);

    logger.info(
      `SQS Message Sent: ${JSON.stringify(sendMessageCommandOutput, null, 2)}`
    );
  } catch (err) {
    logger.error("Failed to send sqs message");
    logger.error(err);
  }
};
