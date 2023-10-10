import { Row } from "@aws-sdk/client-athena";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { AppDO, DomainDO } from "Commons/dynamodb";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import { DomainDAO } from "Commons/dynamodb/tables/DomainDAO";
import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
} from "Commons/Isengard";
import { toAirportCode } from "Commons/utils/regions";
import fs from "fs";
import { LRUCache } from "lru-cache";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const query = `
SELECT date, time, host
FROM "aemilia_cf_access_logs_db"."partitioned_parquet_logs"
WHERE date >= (select from_iso8601_date('2023-09-27') AS date) AND date <= (select from_iso8601_date('2023-09-28') AS date)
`;

const from = new Date(2023, 8, 27, 15, 13);
const to = new Date(2023, 8, 28, 16, 28);

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Gathers stats for top 1000 apps with highest TPS in every region and calculates
the throttling tokens consumed.

Usage:
ts-node investigateThrottlingLimits.ts --region us-west-2
ts-node investigateThrottlingLimits.ts
`
    )
    .option("region", {
      describe:
        "provide region like us-west-2. if no region is provided, all regions are evaludated by default.",
      type: "string",
      demandOption: false,
    })
    .option("outputDir", {
      describe: "./output",
      type: "string",
      demandOption: false,
      default: "out",
    })
    .strict()
    .version(false)
    .help().argv;

  let { region, outputDir } = args;

  let accounts: AmplifyAccount[] = await controlPlaneAccounts({
    stage: "prod",
    region: region as Region | undefined,
  });

  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const completedFilesPath = path.resolve(
    os.homedir(),
    "DailyJournalFiles",
    "completedFiles.txt"
  );

  await preflightCAZ({ accounts, role: "OncallOperator" });
  await Promise.all(
    accounts.map((a) =>
      queryTpsUsage(
        `${toAirportCode(a.region)}.csv`,
        path.resolve(os.homedir(), `${toAirportCode(a.region)}-impact.csv`),
        a
      )
    )
  );
};

async function queryTpsUsage(
  outputFile1: string,
  outputFile2: string,
  account: AmplifyAccount
) {
  let controlplaneCredentials: Provider<AwsCredentialIdentity> | undefined;

  controlplaneCredentials = getIsengardCredentialsProvider(
    account.accountId,
    "OncallOperator"
  );

  const domainDao = new DomainDAO(
    account.stage,
    account.region,
    controlplaneCredentials
  );
  const appDao = new AppDAO(
    account.stage,
    account.region,
    controlplaneCredentials
  );
  const domainDOCache = new LRUCache<string, DomainDO>({
    max: 10000,
    fetchMethod: async (key) => {
      const res = await domainDao.getDomainById(key, ["appId"]);
      return res![0];
    },
  });
  const appDOCache = new LRUCache<string, AppDO>({
    max: 10000,
    fetchMethod: async (key) => {
      return appDao.getAppById(key, ["appId", "accountId"]);
    },
  });

  // const results = await accessLogsClient.query(query);
  // const resultsMatrix = mapAthenaResultsToMatrix(results);
  // console.log("finish");
  const results = fs.readFileSync(outputFile1).toString().split("\n");

  const affectedAccounts = new Set<string>();
  const affectedApps = new Set<string>();

  for (let row of results) {
    if (!row) {
      continue;
    }

    const domainId = row.split(".")[0]!;
    const domainDo = await domainDOCache.fetch(domainId);
    let appId = domainDo ? domainDo.appId : domainId;

    const appDo = await appDOCache.fetch(appId);
    if (!appDo) {
      continue;
    }

    console.log(appId);

    affectedApps.add(appDo.appId);
    affectedAccounts.add(appDo.accountId);
  }
  fs.appendFileSync(outputFile2, `${Array.from(affectedAccounts).join("\n")}`);
  fs.appendFileSync(outputFile2, `${Array.from(affectedApps).join("\n")}`);
}

function mapAthenaResultsToMatrix(rows: Row[]) {
  console.log("start");
  return rows.map((r) => r.Data?.map((d) => d.VarCharValue));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
