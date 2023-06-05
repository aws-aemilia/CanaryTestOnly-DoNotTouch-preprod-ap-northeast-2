import {
  AmplifyAccount,
  controlPlaneAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../../Commons/Isengard";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { getPayerToken } from "../../../Commons/dynamodb/tables/payerToken";
import {
  BatchGetProjectsCommand,
  CodeBuildClient,
} from "@aws-sdk/client-codebuild";
import { getAppIdsForAccount } from "../../../Commons/dynamodb";
import yargs from "yargs";
import { getReportedAccountIds } from "./common";

async function getCodeBuildProjects(
  ddb: DynamoDBDocumentClient,
  codeBuildClient: CodeBuildClient,
  account: AmplifyAccount,
  accountId: string
): Promise<string[]> {
  const appIds = await getAppIdsForAccount(
    ddb,
    account.stage,
    account.region,
    accountId
  );

  if (appIds.length === 0) {
    return [];
  }

  const batchGetProjectsCommandOutput = await codeBuildClient.send(
    new BatchGetProjectsCommand({ names: appIds })
  );

  return (
    batchGetProjectsCommandOutput.projects?.map((project) => project.arn!) ?? []
  );
}

export async function verify({
  stage,
  region,
  accountIds,
}: {
  stage: Stage;
  region: Region;
  accountIds: string[];
}): Promise<void> {
  const account = await controlPlaneAccount(stage, region);

  const ddb = DynamoDBDocumentClient.from(
    new DynamoDB({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        "FullReadOnly"
      ),
    })
  );

  const codeBuildClient = new CodeBuildClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "FullReadOnly"
    ),
  });

  for (const accountId of accountIds) {
    const payerToken = await getPayerToken(
      ddb,
      account.stage,
      account.region,
      accountId
    );

    const projects = await getCodeBuildProjects(
      ddb,
      codeBuildClient,
      account,
      accountId
    );

    if (payerToken?.accountAbuseStatus === "BLOCKED" && projects.length === 0) {
      console.log("Account verified:", accountId);
      continue;
    }
    console.log("Account failed verification", {
      accountId,
      region: account.airportCode,
      accountAbuseStatus: payerToken?.accountAbuseStatus,
      projects,
    });
  }
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
    Verify that the accounts have been blocked and that their CodeBuild Projects were deleted.
    
    This tool operates exclusively on accounts present on the account_reported.json file.
    Use the --accountId and --reportedAfter flags to operate on a subset of accounts.
   `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "Run the tool for exactly one account",
      type: "string",
    })
    .option("reportedAfter", {
      describe:
        "Only operate on accounts reported after the provided date 2023-04-13T04:21:00.590Z",
      type: "string",
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, reportedAfter, ticket } = args;

  const targetAccountIds = getReportedAccountIds({
    reportedAfter,
    accountId,
  });

  process.env.ISENGARD_SIM = ticket;

  console.log("Verifying accounts", { targetAccountIds });

  await verify({
    stage: stage as Stage,
    region: region as Region,
    accountIds: targetAccountIds,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
