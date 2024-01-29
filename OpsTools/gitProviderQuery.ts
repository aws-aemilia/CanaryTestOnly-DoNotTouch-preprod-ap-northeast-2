import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocument,
  paginateQuery,
  paginateScan,
  QueryCommandInput,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import {
  AmplifyAccount,
  controlPlaneAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
} from "Commons/Isengard";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";

const roleName = "FullReadOnly";

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .option("stage", {
      describe: "test, beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("days", {
      describe: "time range in days",
      type: "number",
      demandOption: true,
    })
    .option("git-provider", {
      describe: "git provider for query",
      type: "string",
      demandOption: true,
      choices: ["github", "codecommit"],
    })
    .option("regions", {
      describe: "optional single region",
      type: "array",
    })
    .strict()
    .version(false)
    .help().argv;

  let accounts: AmplifyAccount[] = [];
  if (args.regions != undefined) {
    for (const r of args.regions) {
      accounts.push(
        await controlPlaneAccount(
          args.stage as Stage,
          toRegionName(r as string)
        )
      );
    }
  } else {
    accounts = await controlPlaneAccounts({ stage: args.stage as Stage });
  }

  await preflightCAZ({
    accounts,
    role: [roleName],
  });

  let gitProvider = args["git-provider"];
  console.log(
    `Determining the number of ${args.stage} apps with jobs in the last ${args.days} days in each region with git provider ${gitProvider}...`
  );

  await Promise.allSettled(
    accounts.map((account) => {
      console.log(`Starting region ${account.region}`);
      return getNumberOfAppsWithGitProviderInTimeRange(
        account,
        account.region,
        account.stage,
        gitProvider,
        args.days
      );
    })
  );
};

const getNumberOfAppsWithGitProviderInTimeRange = async (
  account: AmplifyAccount,
  region: string,
  stage: string,
  gitProvider: string,
  days: number
) => {
  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    roleName
  );
  const ddbDocClient = DynamoDBDocument.from(
    new DynamoDBClient({ credentials, region })
  );
  const command: ScanCommandInput = {
    TableName: `${stage}-${region}-App`,
    FilterExpression: "contains(repository, :repo)",
    ExpressionAttributeValues: { ":repo": gitProvider },
  };
  const paginator = paginateScan({ client: ddbDocClient }, command);
  let numberOfApps = 0;
  for await (const appPage of paginator) {
    const appItems = appPage.Items ?? [];
    for (const app of appItems) {
      if (
        await appHasBranchWithJobInLastDays(
          ddbDocClient,
          app.appId,
          days,
          stage,
          region
        )
      ) {
        numberOfApps++;
      }
    }
  }
  console.log(
    `Number of apps using ${gitProvider} in the past ${days} days in ${region}: ${numberOfApps}`
  );
};

const appHasBranchWithJobInLastDays = async (
  ddbDocClient: DynamoDBClient,
  appId: string,
  days: number,
  stage: string,
  region: string
): Promise<boolean> => {
  const branchQueryInput: QueryCommandInput = {
    TableName: `${stage}-${region}-Branch`,
    KeyConditionExpression: "appId = :appId",
    ExpressionAttributeValues: { ":appId": appId },
  };
  const paginator = paginateQuery({ client: ddbDocClient }, branchQueryInput);
  for await (const branchPage of paginator) {
    const branchItems = branchPage.Items ?? [];
    for (const branch of branchItems) {
      if (
        await branchHasJobInLastDays(
          ddbDocClient,
          branch.branchArn,
          days,
          stage,
          region
        )
      ) {
        return true;
      }
    }
  }
  return false;
};

const branchHasJobInLastDays = async (
  ddbDocClient: DynamoDBClient,
  branchArn: string,
  timeRangeInDays: number,
  stage: string,
  region: string
): Promise<boolean> => {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - timeRangeInDays);
  const jobQueryInput: QueryCommandInput = {
    TableName: `${stage}-${region}-Job`,
    KeyConditionExpression: "branchArn = :branchArn",
    FilterExpression: "endTime >= :endTime",
    ExpressionAttributeValues: {
      ":branchArn": branchArn,
      ":endTime": dateThreshold.toJSON().toString(),
    },
  };
  const paginator = paginateQuery({ client: ddbDocClient }, jobQueryInput);
  for await (const jobPage of paginator) {
    if ((jobPage.Count ?? 0) > 0) {
      return true;
    }
  }
  return false;
};

main().then(() => console.log("done"));
