import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
} from "../Isengard";

import yargs from "yargs";
import { getTicket } from "../SimT";

type EventType = "IsolateResources" | "RestoreResources";
const buildMessage = (accountId: string, eventType: EventType) => {
  return {
    eventType,
    eventMessage: {
      accountId,
      topicName: "ManualAction",
      publishTimestamp: Date.now(),
      eventId: "00000000-sent-by-disableAbuseAccount-tool",
      reasonCode: "ManualAction",
    },
    appDOS: [],
  };
};

const accountClosureQueue = (amplifyAccount: AmplifyAccount): string => {
  return `https://sqs.${amplifyAccount.region}.amazonaws.com/${amplifyAccount.accountId}/AccountClosingDeletionQueue`;
};

const extractAccountIds = (text: string): string[] => {
  const accountIdRegex = /(?<!\d)[\d]{12}(?!\d)/g;
  return Array.from(text.matchAll(accountIdRegex), (m) => m[0]);
};

const validateAbuseTicket = async (
  ticket: string,
  accountId: string,
  action: "Block" | "Unblock" = "Block"
) => {
  const ticketData = await getTicket(ticket);

  const uniqueAccountIds = [
    ...new Set([
      ...extractAccountIds(ticketData.title),
      ...extractAccountIds(ticketData.description),
    ]),
  ];

  const abuseTicketTitlePrefix = `Amplify Abuse - Request to ${action} AWS Customer`;

  if (!ticketData.title.includes(abuseTicketTitlePrefix)) {
    throw new Error(
      `The provided ticket does not look like an abuse report ticket. Expecting "${abuseTicketTitlePrefix}" to be present in the title`
    );
  }

  if (uniqueAccountIds.length == 0) {
    throw new Error(
      `No accountIds were found in ticket ${ticket}. Is this right ticket?`
    );
  }

  if (uniqueAccountIds.length > 1) {
    throw new Error(
      `Multiple accountIds were found in ticket ${ticket}: [${uniqueAccountIds}]. Abuse tickets usually target exactly one account. Is this right ticket?`
    );
  }

  if (accountId !== uniqueAccountIds[0]) {
    throw new Error(
      `The provided accountId (${accountId}) does not match the accountId found in the ${ticket} ticket (${uniqueAccountIds[0]})`
    );
  }
};

const sendMessage = async (
  account: AmplifyAccount,
  accountId: string,
  eventType: EventType
): Promise<void> => {
  const sqsClient = new SQSClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  const sendMessageCommand = new SendMessageCommand({
    QueueUrl: accountClosureQueue(account),
    MessageBody: JSON.stringify(buildMessage(accountId, eventType)),
  });

  console.log(`sending SQS message: `, sendMessageCommand.input);

  const sendMessageCommandOutput = await sqsClient.send(sendMessageCommand);

  console.log(JSON.stringify(sendMessageCommandOutput, null, 2));
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
          Disable ALL Apps in ALL regions for an AWS account flagged for abuse. This tool sends an "IsolateResources" sqs message to the AccountClosure service queue.
          ** Requires kcurl to be installed **
          `
    )
    .option("accountId", {
      describe: "The accountId that is flagged for abuse",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe:
        'The Id of the "Amplify Abuse - Request to Block AWS Customer" (or Unblock) ticket. e.g. V594515849',
      type: "string",
      demandOption: true,
    })
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("unblock", {
      describe:
        'Unblock the Account. Will send a "RestoreResources" message instead',
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { accountId, ticket, stage, unblock } = args;

  const action = unblock ? "Unblock" : "Block";

  await validateAbuseTicket(ticket, accountId, action);
  console.log(
    `verified that ${ticket} is a valid "Request to ${action} AWS Customer" ticket for account ${accountId}`
  );

  const controlPLaneAccounts = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === stage
  );

  for (const controlPLaneAccount of controlPLaneAccounts) {
    console.log(`Disabling account in ${controlPLaneAccount.region}...`);
    await sendMessage(
      controlPLaneAccount,
      accountId,
      action == "Block" ? "IsolateResources" : "RestoreResources"
    );
  }

  console.log("SUCCESS");
  console.log(
    `you can go to https://genie.console.amplify.aws.a2z.com/${stage}/customer/${accountId} to verify that Apps are disabled in all regions. It may take a few minutes for changes to take effect`
  );
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
