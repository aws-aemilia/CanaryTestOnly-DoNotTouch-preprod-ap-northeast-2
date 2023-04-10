import { AmplifyAccount, controlPlaneAccounts, getIsengardCredentialsProvider } from "../Isengard";
import { SQSClient } from "@aws-sdk/client-sqs";
import { sendMessage } from "../libs/SQS";
import { whoAmI } from "../utils";
import pino from "pino";
import pinoPretty from "pino-pretty";
import sleep from "../utils/sleep";

const { chunkPromise, PromiseFlavor } = require("chunk-promise");
const logger = pino(pinoPretty());

export type AbuseAccountAction = "BLOCK" | "UNBLOCK";

const buildMessage = (
  abuseAccountId: string,
  abuseAccountAction: AbuseAccountAction
) => {
  return {
    action: abuseAccountAction,
    accountId: abuseAccountId,
    metadata: `${whoAmI()} sent by disableAbuseAccount tool`,
  };
};

const accountClosureQueue = (amplifyAccount: AmplifyAccount): string => {
  return `https://sqs.${amplifyAccount.region}.amazonaws.com/${amplifyAccount.accountId}/AbuseReportQueue`;
};

export const updateBlockStatusForAccountIds = async (
  abuseAccountIds: string[],
  stage: string,
  action: AbuseAccountAction,
  role: string,
  concurrency?: number
) => {
  const controlPLaneAccounts = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === stage
  );

  for (const controlPLaneAccount of controlPLaneAccounts) {
    const sqsClient = new SQSClient({
      region: controlPLaneAccount.region,
      credentials: getIsengardCredentialsProvider(controlPLaneAccount.accountId, role),
    });
    
    const promises: (() => Promise<void>)[] = [];

    for (const abuseAccountId of abuseAccountIds) {
      logger.info(
        `Disabling account ${abuseAccountId} in ${controlPLaneAccount.region}...`
      );

      const queueUrl = accountClosureQueue(controlPLaneAccount);
      const messageBody = JSON.stringify(buildMessage(abuseAccountId, action));
      promises.push(() =>
        sendMessage(controlPLaneAccount, queueUrl, messageBody, role, sqsClient)
      );
    }

    await chunkPromise(promises, {
      concurrent: concurrency || 10,
      promiseFlavor: PromiseFlavor.PromiseAll,
    });

    await sleep(5000);
  }
  logger.info(`Done sending SQS Messages to block accounts ${abuseAccountIds}`);
};

export const updateBlockStatusForAccountId = async (
  abuseAccountId: string,
  stage: string,
  action: AbuseAccountAction,
  role: string
) => {
  const controlPLaneAccounts = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === stage
  );

  for (const controlPLaneAccount of controlPLaneAccounts) {
    logger.info(
      `Disabling account ${abuseAccountId} in ${controlPLaneAccount.region}...`
    );

    const queueUrl = accountClosureQueue(controlPLaneAccount);
    const messageBody = JSON.stringify(buildMessage(abuseAccountId, action));
    await sendMessage(controlPLaneAccount, queueUrl, messageBody, role);
  }

  logger.info(`Done sending SQS Messages to block account ${abuseAccountId}`);
};
