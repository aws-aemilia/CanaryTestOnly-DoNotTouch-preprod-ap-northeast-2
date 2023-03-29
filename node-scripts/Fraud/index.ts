import { AmplifyAccount, controlPlaneAccounts } from "../Isengard";
import { sendMessage } from "../libs/SQS";
import { whoAmI } from "../utils";
import pino from "pino";
import pinoPretty from "pino-pretty";

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
