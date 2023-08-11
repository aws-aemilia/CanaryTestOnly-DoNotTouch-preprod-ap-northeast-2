import {
  ListDeadLetterSourceQueuesCommand,
  ListQueuesCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";

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

  // This loop doesn't work - even when there are > 10 messages on the queue, on subsequent polls, it doesn't return any
  // messages. Need to figure out why, but for now, we may just need to rerun scripts multiple times for > 10 messages
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

/**
 * Returns a queue URL for a given queue prefix. If multiple queues match the prefix,
 * an error is thrown, so you'll need to specify a more specific prefix.
 *
 * @param sqsClient The SQS client to use
 * @param queuePrefix i.e. DeploymentServiceDLQ-
 * @returns the queue URL
 */
export async function getQueueUrl(
  sqsClient: SQSClient,
  queuePrefix: string
): Promise<string> {
  const queues = await sqsClient.send(
    new ListQueuesCommand({
      QueueNamePrefix: queuePrefix,
    })
  );

  if (!queues.QueueUrls || queues.QueueUrls.length === 0) {
    throw new Error(`No queue found with prefix ${queuePrefix}`);
  }

  if (queues.QueueUrls.length > 1) {
    throw new Error(`Multiple queues found with prefix ${queuePrefix}`);
  }

  return queues.QueueUrls[0];
}

/**
 * Returns the source queue URL for a given DLQ queue URL.
 */
export async function getSourceQueueUrl(
  sqsClient: SQSClient,
  dlqQueue: string
): Promise<string> {
  console.log(`Getting source queue URL for ${dlqQueue}`);

  const queueUrls = (
    await sqsClient.send(
      new ListDeadLetterSourceQueuesCommand({ QueueUrl: dlqQueue })
    )
  ).queueUrls?.filter(
    // AccountClosingDeletionDLQ has 2 sources and we don't want to ever redrive into AccountDeferredTerminationQueue
    (queueUrl) => !queueUrl.includes("AccountDeferredTerminationQueue")
  );

  if (!queueUrls || queueUrls.length === 0) {
    throw new Error(`No source queue found for ${dlqQueue}`);
  }

  if (queueUrls.length > 1) {
    throw new Error(
      `Multiple source queues found for ${dlqQueue}. This is not expected.\n${queueUrls}`
    );
  }

  console.log(`Found source queue URL ${queueUrls[0]}`);

  return queueUrls[0];
}

/**
 * Pretty prints a message body assuming it is JSON
 */
export function prettyPrint(msg: Message): string {
  try {
    return JSON.stringify(JSON.parse(msg.Body!), null, 2) ;
  } catch (e) {
    return msg.Body ?? "";
  }
}
