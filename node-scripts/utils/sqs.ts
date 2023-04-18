import { ReceiveMessageCommand, SQSClient, Message } from "@aws-sdk/client-sqs";

/**
 * Polls for messages until reaching the desired message count or
 * until the queue is empty, whatever is first.
 *
 * @param sqsClient SQS client initialized with account credentials
 * @param queueUrl The queue URL to poll
 * @param maxMessages The maximum number of messages to poll
 *
 * @returns SQS messages
 */
export async function pollMessages(
  sqsClient: SQSClient,
  queueUrl: string,
  maxMessages: number = 100
): Promise<Message[]> {
  const messages: Message[] = [];

  while (messages.length < maxMessages) {
    const result = await sqsClient.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        AttributeNames: ["All"],
      })
    );

    if (!result.Messages || result.Messages.length === 0) {
      break;
    }

    messages.push(...result.Messages);
  }

  return messages;
}
