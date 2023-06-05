import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import { AppDOItem } from "../../commons/dynamodb";
import {
  controlPlaneAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../commons/Isengard";
import { getAppsByAppIds } from "../../commons/libs/Amplify";
import { doQuery } from "../../commons/libs/CloudWatch";
import { createTicket, CreateTicketParams } from "../../commons/SimT/createTicket";
import { BatchIterator } from "../../commons/utils/BatchIterator";
import fs from "fs";
import confirm from "../../commons/utils/confirm";
import {
  AbuseAccountAction,
  updateBlockStatusForAccountIds,
} from "../../commons/Fraud";
import { stopBuilds } from "./stopBuilds";
import {
  readReportedAccountIds,
  reportedAccountsFile,
} from "./reportedAccounts";

const SimClient = require("@amzn/sim-client");

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(`Detect malicious build requests, report them to Fraud team, and cancel their builds.`)
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

  let apps: AppDOItem[] = [];
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
      // App name should be task1, task2, task3, etc.
      let appName = a.name.S;
      if (!appName.match(/^task\d+$/)) {
        throw new Error("Illegal app name, Check detect CW insight query");
      }
      console.log(a.appId, a.name.S, a.cloneUrl.S);
    });
  }

  const accountIdsSorted = Array.from(accountIds).sort();

  if (accountIdsSorted.length) {
    const reportedAccounts = Object.keys(readReportedAccountIds());
    const unreportedAccounts = accountIdsSorted.filter((a) => {
      if (reportedAccounts.includes(a)) {
        console.info("Account already reported", a);
        return false;
      }
      return true;
    });
    await reportAccounts(unreportedAccounts);

    const cpAccounts = await controlPlaneAccounts({ stage: "prod" })

    for (let account of cpAccounts) {
      const regionalControlplaneCredentials = getIsengardCredentialsProvider(
        account.accountId,
        "OncallOperator"
      );

      await stopBuilds(
        stage as Stage,
        account.region as Region,
        regionalControlplaneCredentials,
        unreportedAccounts,
        1, // We'll stop builds 1 account at a time.
        console,
        false,
      )
    }
  }
  process.exit(0);
};

async function reportAccounts(unreportedAccounts: string[]) {
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
        impact: 3,
      },
    },
  };

  console.log(ticketParams);
  const proceed = await confirm(`Do you want to cut the above ticket?`);
  if (!proceed) {
    console.log("Skipping cutting ticket");
    return "";
  }

  writeReportedAccountIds(unreportedAccounts, new Date());
  await createTicket(ticketParams);
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
| filter @message like /screen -d -m bash -c "python3 index.py;"/ or strcontains(@message, "https://github.com/meuryalos") or strcontains(@message, "nohup: failed to run command \‘./asfafad\’") or strcontains(@message, "# Executing command: timeout 400m ./time") or strcontains(@message, "miner	System will mine to")
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
