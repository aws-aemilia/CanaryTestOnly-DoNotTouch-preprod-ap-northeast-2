import { Row } from "@aws-sdk/client-athena";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import fs, { existsSync, mkdirSync } from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  AmplifyAccount,
  Region,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "../../Commons/Isengard";
import { AppDAO } from "../../Commons/dynamodb/tables/AppDAO";
import { DomainDAO } from "../../Commons/dynamodb/tables/DomainDAO";
import { CfAccessLogs } from "../../Commons/libs/CfAccessLogs";
import { LRUCache } from "lru-cache";
import { AppDO, DomainDO } from "../../Commons/dynamodb";

const query = `
SELECT 
    host,
    approx_percentile(cache_miss_count, 0.95) as cache_miss_count_p95,
    approx_percentile(cache_miss_count, 0.99) as cache_miss_count_p99,
    approx_percentile(cache_miss_count, 0.995) as cache_miss_count_p995,
    approx_percentile(cache_miss_count, 1.00) as cache_miss_count_p100,
    approx_percentile(request_cost, 0.95) as request_cost_p95,
    approx_percentile(request_cost, 0.99) as request_cost_p99,
    approx_percentile(request_cost, 0.995) as request_cost_p995,
    approx_percentile(request_cost, 1.00) as request_cost_p100
FROM (
    SELECT
        year, month, day, hour, time, host,
        count(*) as cache_miss_count,
        avg("timetaken") * count(*) as request_cost
    FROM "aemilia_cf_access_logs_db"."partitioned_parquet_logs"
    WHERE year = '2023' AND month IN ('08', '07', '06') AND
    NOT (
      responseresulttype IN ('Hit', 'RefreshHit', 'LambdaExecutionError') OR status = 0 OR
      (resulttype='Error' and responseresulttype='Error' and status = 429) OR
      ((resulttype='LambdaLimitExceeded' or responseresulttype='LambdaLimitExceeded') and (status = 503 or status=0)) OR
      ((resulttype='LimitExceeded' or responseresulttype='LimitExceeded') and (status = 503 or status=0))
    )
    GROUP BY year, month, day, hour, time, host
)
GROUP BY host
ORDER BY request_cost_p100 DESC, request_cost_p99 DESC
LIMIT 1000
`;

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
  const runId = Date.now();
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const outputFile = path.join(outputDir, `${runId}-traffic-stats-by-host.csv`);

  const csvHeading = [
    "host",
    "cache_miss_count_p95",
    "cache_miss_count_p99",
    "cache_miss_count_p995",
    "cache_miss_count_p100",
    "request_cost_p95",
    "request_cost_p99",
    "request_cost_p995",
    "request_cost_p100",
    "appId",
    "platform",
    "region",
  ].join(",");
  fs.appendFileSync(outputFile, `${csvHeading}\n`);

  let accounts: AmplifyAccount[] = await controlPlaneAccounts({
    stage: "prod",
    region: region as Region | undefined,
  });

  await preflightCAZ({ accounts, role: "OncallOperator" });
  await Promise.all(accounts.map((a) => queryTpsUsage(outputFile, a)));
};

async function queryTpsUsage(outputFile: string, account: AmplifyAccount) {
  let controlplaneCredentials: Provider<AwsCredentialIdentity> | undefined;

  controlplaneCredentials = getIsengardCredentialsProvider(
    account.accountId,
    "OncallOperator"
  );

  const accessLogsClient = new CfAccessLogs(
    account.accountId,
    account.region,
    controlplaneCredentials
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
      return appDao.getAppById(key, ["appId", "platform"]);
    },
  });

  const results = await accessLogsClient.query(query);
  const resultsMatrix = mapAthenaResultsToMatrix(results);

  for (let row of resultsMatrix) {
    if (!row) {
      continue;
    }

    if (row[0] === "host") {
      // skip heading row
      continue;
    }

    const domainId = row[0]?.split(".")[0]!;
    const domainDo = await domainDOCache.fetch(domainId);
    if (!domainDo) {
      continue;
    }

    const appDo = await appDOCache.fetch(domainDo.appId);
    if (!appDo) {
      continue;
    }

    row.push(appDo.appId);
    row.push(appDo.platform);
    row.push(account.region);

    fs.appendFileSync(outputFile, `${row.join(",")}\n`);
  }
}

function mapAthenaResultsToMatrix(rows: Row[]) {
  return rows.map((r) => r.Data?.map((d) => d.VarCharValue));
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
