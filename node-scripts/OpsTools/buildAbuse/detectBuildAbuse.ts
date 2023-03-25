import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import { AppDO } from "../../dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import { getAppsByAppIds } from "../../libs/Amplify";
import { doQuery } from "../../libs/CloudWatch";
import { createTicket, CreateTicketParams } from "../../SimT/createTicket";
import { BatchIterator } from "../../utils/BatchIterator";
const SimClient = require("@amzn/sim-client");
import fs from "fs";
import confirm from "../../utils/confirm";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(`Detect malicious build requests`)
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      default: "us-east-1",
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  const maliciousAppIds = await getMaliciousApps(
    stage,
    region,
    minutesAgo(1440),
    new Date()
  );

  const cpAccount = await controlPlaneAccount(stage as Stage, region as Region);
  const controlplaneCredentials = getIsengardCredentialsProvider(
    cpAccount.accountId,
    "FullReadOnly"
  );

  const dynamodb = getDdbClient(region, controlplaneCredentials);

  let apps: AppDO[] = [];
  for (let appIds of new BatchIterator(Array.from(maliciousAppIds), 10)) {
    const maliciousApps = await getAppsByAppIds(
      dynamodb,
      stage,
      region,
      appIds
    );

    maliciousApps.forEach((a) => apps.push(a));
  }

  let accountIds = new Set<string>();
  apps.forEach((a) => accountIds.add(a.accountId.S));

  for (let accountId of accountIds) {
    console.log(
      `===========Apps in Account ${accountId}, https://genie.console.amplify.aws.a2z.com/prod/customer/${accountId}}===========`
    );
    const appsInAccount = apps.filter((a) => (a.accountId.S = accountId));
    appsInAccount.forEach((a) => {
      console.log(a.appId, a.name.S, a.cloneUrl.S);
    });
  }

  const accountIdsSorted = Array.from(accountIds).sort();

  if (accountIdsSorted.length) {
    await reportAccounts(accountIdsSorted);
  }
};

async function reportAccounts(accountIds: string[]) {
  const reportedAccounts = Object.keys(readReportedAccountIds());
  const unreportedAccounts = accountIds.filter((a) => {
    if (reportedAccounts.includes(a)) {
      console.info("Account already reported", a);
      return false;
    }
    return true;
  });

  const accountsList = unreportedAccounts.join("\n");
  const description = `
Please give this Ticket ID to the Abuse agent who is assisting you.

AWS account ID: Multiple
Case ID:

How can we help: We are the Amplify Hosting team. We have a customer creating spam builds to our service. They are creating multiple Amplify apps and triggering builds across multiple regions.

Account ID
${accountsList}

We need help blocking these accounts from an AWS level.

This is the same type of accounts associated with prior abuse ticket: https://t.corp.amazon.com/P83259214`;

  const ticketParams: CreateTicketParams = {
    title:
      "AWS T&S Abuse query - Amplify Hosting Spam builds - Account ID - Multiple",
    description,
    assignedFolder: "59885462-b9aa-49dc-9627-0468b1a76fad",
    extensions: {
      tt: {
        category: "AWS",
        type: "Fraud",
        item: "Investigate Account",
        assignedGroup: "AWS Fraud Investigations",
        caseType: "Trouble Ticket",
        impact: 2,
      },
    },
  };

  console.log(ticketParams);
  const proceed = await confirm(`Do you want to cut the above ticket?`);
  if (!proceed) {
    console.log("Skipping cutting ticket");
    return "";
  }

  writeReportedAccountIds(accountIds, new Date());
  await createTicket(ticketParams);
  process.exit(0);
}

function getDdbClient(region: string, credentials?: Provider<Credentials>) {
  const dynamodbClient = new DynamoDBClient({ region, credentials });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

/**
 *
 * @returns partial branchArn of the form ${appId}/branches/${branchName}
 */
async function getMaliciousApps(
  stage: string,
  region: string,
  startDate: Date,
  endDate: Date
) {
  const account = await controlPlaneAccount(stage as Stage, region as Region);

  const query = `
fields @message, @logStream
| filter strcontains(@message, "https://github.com/meuryalos") or strcontains(@message, "nohup: failed to run command \‘./asfafad\’") or strcontains(@message, "# Executing command: timeout 400m ./time")
| limit 10000
`;
  const queryResult = await doQuery(
    account,
    "AWSCodeBuild",
    query,
    startDate,
    endDate,
    "FullReadOnly"
  );

  const appIds = new Set<string>();

  queryResult
    ?.map((q) => q.split(","))
    .forEach(([msg, qs]) => {
      const [appId, _streamGuid] = qs.split("/");
      appIds.add(appId);
    });

  return appIds;
}

const minutesAgo = (n: number) =>
  new Date(new Date().getTime() - 60 * 1000 * n);

const reportedAccountsFile = "./account_reported.json";
type ReportedAccounts = {
  [accountId: string]: {
    reportedOn: string;
    ticket?: string;
    disabled?: boolean;
  };
};

function readReportedAccountIds(): ReportedAccounts {
  const accounts: ReportedAccounts = JSON.parse(
    fs.readFileSync(reportedAccountsFile, "utf8")
  );
  return accounts;
}

function writeReportedAccountIds(accountIds: string[], reportedOn: Date) {
  const alreadyReported = readReportedAccountIds();
  for (let acct of accountIds) {
    if (alreadyReported[acct]) {
      continue;
    }

    alreadyReported[acct] = { reportedOn: reportedOn.toISOString() };
  }

  fs.writeFileSync(
    reportedAccountsFile,
    JSON.stringify(alreadyReported, null, 2)
  );
}

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
