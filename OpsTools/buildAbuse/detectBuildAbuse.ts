import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import { AppDO } from "../../Commons/dynamodb";
import {
  controlPlaneAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
} from "../../Commons/Isengard";
import { getAppsByAppIds } from "../../Commons/libs/Amplify";
import { doQuery } from "../../Commons/libs/CloudWatch";
import { BatchIterator } from "../../Commons/utils/BatchIterator";
import fs from "fs";
import confirm from "../../Commons/utils/confirm";
import { stopBuilds } from "./stopBuilds";
import {
  readReportedAccountIds,
  reportedAccountsFile,
} from "./reportedAccounts";
import { toRegionName } from "../../Commons/utils/regions";
import { TicketData } from "@amzn/tickety-typescript-sdk";
import {
  createCategorization,
  TicketyService,
} from "../../Commons/SimT/Tickety";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Detect malicious build requests, report them to Fraud team, and cancel their builds.
    
        npx ts-node OpsTools/buildAbuse/detectBuildAbuse.ts
    `
    )
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
    .strict()
    .version(false)
    .help().argv;

  let { region, stage } = args;
  region = toRegionName(region);

  // Need FullReadOnly for queries and OncallOperator to StopBuilds
  await preflightCAZ({
    accounts: await controlPlaneAccounts({ stage: stage as Stage }),
    role: ["FullReadOnly", "OncallOperator"],
  });

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
  apps.forEach((a) => accountIds.add(a.accountId));

  for (let accountId of accountIds) {
    console.log(
      `===========Apps in Account ${accountId}, https://genie.console.amplify.aws.a2z.com/prod/customer/${accountId}}===========`
    );
    const appsInAccount = apps.filter((a) => (a.accountId = accountId));
    appsInAccount.forEach((a) => {
      // App name should be task1, task2, task3, etc.
      let appName = a.name;
      if (!appName.match(/^task\d+$/)) {
        throw new Error("Illegal app name, Check detect CW insight query");
      }
      console.log(a.appId, a.name, a.cloneUrl);
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
    if (unreportedAccounts.length > 0) {
      await reportAccounts(unreportedAccounts);
    }

    const cpAccounts = await controlPlaneAccounts({ stage: "prod" });

    console.log("Stopping builds in ALL regions");
    const stopBuildsInRegionPromises: Promise<void>[] = cpAccounts.map(
      async (account) => {
        const regionalControlplaneCredentials = getIsengardCredentialsProvider(
          account.accountId,
          "OncallOperator"
        );

        await stopBuilds(
          stage as Stage,
          account.region as Region,
          regionalControlplaneCredentials,
          unreportedAccounts,
          3,
          console,
          false
        );
      }
    );
    await Promise.all(stopBuildsInRegionPromises);
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

  const ticketData: TicketData = {
    title:
      "AWS T&S Abuse query - Amplify Hosting Spam builds - Account ID - Multiple",
    description,
    severity: "SEV_3",
    categorization: createCategorization("AWS", "Fraud", "Investigate Account"),
  };

  console.log(ticketData);
  const proceed = await confirm(`Do you want to cut the above ticket?`);
  if (!proceed) {
    console.log("Skipping cutting ticket");
    return;
  }

  const ticketyService = new TicketyService();
  const output = await ticketyService.createTicket(ticketData);
  console.log(`Created ticket: ${output.id}`);
  writeReportedAccountIds(unreportedAccounts, new Date());
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
| filter @message like /screen -d -m bash -c "python3 index.py;"/ or strcontains(@message, "https://github.com/meuryalos") or strcontains(@message, "nohup: failed to run command \‘./asfafad\’") or strcontains(@message, "# Executing command: ./time") or strcontains(@message, "miner	System will mine to")
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
