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
import logger from "../../Commons/utils/logger";

const ACCOUNTS_TO_STOP_AT_A_TIME_LIMIT = 3;
const TWENTY_FOUR_HOURS_IN_MINUTES = 1_440;
const MAX_ACCOUNT_IDS_PER_TICKET = 500;

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
    minutesAgo(TWENTY_FOUR_HOURS_IN_MINUTES),
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
    logger.info(
      `===========Apps in Account ${accountId}, https://genie.console.amplify.aws.a2z.com/prod/customer/${accountId}}===========`
    );
    const appsInAccount = apps.filter((a) => (a.accountId = accountId));
    appsInAccount.forEach((a) => {
      // App name should be task1, task2, task3, etc.
      let appName = a.name;
      if (!appName.match(/^task\d+$/)) {
        throw new Error("Illegal app name, Check detect CW insight query");
      }
      logger.info({ appId: a.appId, name: a.name, cloneurl: a.cloneUrl });
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
      // There is a maximum number of accounts allowed per ticket.
      // We will loop until we have completed sending tickets for all accounts.
      let reportCreatedForAccounts: string[] = [];
      while (reportCreatedForAccounts.length < unreportedAccounts.length) {
        const currentIndex = reportCreatedForAccounts.length;
        let howManyItemsToCapture =
          unreportedAccounts.length - reportCreatedForAccounts.length;
        if (howManyItemsToCapture > MAX_ACCOUNT_IDS_PER_TICKET) {
          howManyItemsToCapture = MAX_ACCOUNT_IDS_PER_TICKET;
        }
        const accountsToReport = unreportedAccounts.slice(
          currentIndex,
          currentIndex + howManyItemsToCapture
        );
        await reportAccounts(accountsToReport);

        reportCreatedForAccounts =
          reportCreatedForAccounts.concat(accountsToReport);
      }
    }

    const cpAccounts = await controlPlaneAccounts({ stage: "prod" });

    logger.info("Stopping builds in ALL regions");
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
          ACCOUNTS_TO_STOP_AT_A_TIME_LIMIT,
          console,
          false
        );
      }
    );
    await Promise.all(stopBuildsInRegionPromises);
  }

  logger.info(
    "View all created tickets: https://tiny.amazon.com/ko59loyb/amplify-hosting-fraud"
  );
  process.exit(0);
};

async function reportAccounts(unreportedAccounts: string[]) {
  const accountsList = unreportedAccounts.join("\n");
  const description = `
THERE IS A LIMIT OF 500 ACCOUNTS PER TICKET. WE ARE RESEARCHING A WAY TO EXPAND THIS.

A bot will conduct initial triage and then transfer to a human operator if needed. You will need to format your request properly or the bot will get confused. Please provide any supporting information as a comment, do not otherwise modify the fields in the description of this ticket. Documentation is here:
https://w.amazon.com/bin/view/AWSFraudTeam/FraudResponseTeam/Contact/Auto-triage/

Backticks \` in below fields must be kept in order for the bot to understand the input

Please also modify "[Insert Service Name]" in the Title so we can better follow-up on your request.

For an example of a successful request, see:
https://t.corp.amazon.com/P69228836

question/concern (what are you hoping to determine about these accounts?):
if this field is left blank we may auto-resolve, inferring that the bot's reports were sufficient to address your concerns
\`\`\`
provide context here
\`\`\`

report_types:
\`\`\`
fraud_check
cluster_report
ec2_usage
\`\`\`

account_ids:
\`\`\`
${accountsList}
\`\`\`
`;

  const ticketData: TicketData = {
    title: "Bulk Account Review Request for [Amplify Hosting]",
    description,
    severity: "SEV_3",
    categorization: createCategorization(
      "AWS",
      "Fraud",
      "Investigate Bulk Accounts"
    ),
  };

  logger.info({ ticketData });
  const proceed = await confirm(
    `Do you want to cut the above ticket for ${unreportedAccounts.length} accounts?`
  );
  if (!proceed) {
    logger.info("Skipping cutting ticket");
    return;
  }

  const ticketyService = new TicketyService();
  const output = await ticketyService.createTicket(ticketData);
  logger.info(`Created ticket: ${output.id}`);
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
  .catch((err) => {
    logger.error({ err }, "\nSomething went wrong");
  });
