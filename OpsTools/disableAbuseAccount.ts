import yargs from "yargs";
import { AbuseAccountAction, updateBlockStatusForAccountId } from "../commons/Fraud";
import { getTicket } from "../commons/SimT";

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

  // Export ticket ID to environment, as it's needed for Contingent Authorization.
  process.env["ISENGARD_SIM"] = ticket;
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
          Disable ALL Apps in ALL regions for an AWS account flagged for abuse. This tool sends a "BLOCK" message to the AbuseReportQueue
          ** Requires kcurl to be installed, try brew install env-improvement if it isn't. **

          Usage:
          npx ts-node OpsTools/disableAbuseAccount.ts --ticket P123456789 --accountId 123456789
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
    .option("ignoreTicket", {
      describe:
        'Ignore ticket validation. Useful to restore accounts that were blocked by mistake. Can only be used for alongside "unblock"',
      type: "boolean",
    })
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("role", {
      describe:
        "IAM role to assume to run the tool. Role must exist in ALL control plane accounts for all regions",
      type: "string",
      default: "OncallOperator",
      choices: ["OncallOperator", "SupportOps"],
    })
    .option("unblock", {
      describe: 'Unblock the Account. Will send a "UNBLOCK" message instead',
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help()
    .check(({ ignoreTicket, unblock }) => {
      if (ignoreTicket && !unblock) {
        throw new Error(
          '"ignoreTicket" not allowed here. "ignoreTicket" can only be used to "unblock" accounts'
        );
      }
      return true;
    }).argv;

  const { accountId, ticket, ignoreTicket, stage, unblock, role } = args;

  const action = unblock ? "Unblock" : "Block";

  if (ignoreTicket) {
    console.warn(
      'Skipped ticket validation since "ignoreTicket" param was provided'
    );
  } else {
    await validateAbuseTicket(ticket, accountId, action);
    console.log(
      `verified that ${ticket} is a valid "Request to ${action} AWS Customer" ticket for account ${accountId}`
    );
  }

  const abuseAccountAction: AbuseAccountAction =
    action === "Block" ? "BLOCK" : "UNBLOCK";
  await updateBlockStatusForAccountId(
    accountId,
    stage,
    abuseAccountAction,
    role
  );

  console.log("SUCCESS");
  console.log("Resolve and paste the following into the ticket:");
  console.log("================================================");
  console.log(
    `You can go to https://genie.console.amplify.aws.a2z.com/${stage}/customer/${accountId} to verify the status of this account's apps. It may take a few minutes for changes to take effect.`
  );
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
