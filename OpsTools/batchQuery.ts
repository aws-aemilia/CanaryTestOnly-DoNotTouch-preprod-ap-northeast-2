import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AdaptiveRetryStrategy } from "@aws-sdk/middleware-retry";
import sleep from "Commons/utils/sleep";
import yargs from "yargs";
import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  StandardRoles,
} from "../Commons/Isengard";
import {
  cancelRunningQueries,
  insightsQuery,
  Log,
} from "../Commons/libs/CloudWatch";
import { createSpinningLogger } from "../Commons/utils/logger";
import { getQueryConfig } from "./queries/";

export interface Query {
  account: AmplifyAccount;
  role: string;
  logGroupPrefix: string;
  query: string;
  startEndDate: [string, string];
}

export interface QueryConfig {
  getQueries(): Promise<Query[]>;
  handleLogs(q: Query, logs: Log[], session: string): Promise<void>;
}

const logger = createSpinningLogger();

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Run a batch of CloudWatch LogInsights queries based on the provided QueryConfig.
      This batch could be across different regions or different time ranges if the 
      query cannot be completed in 1 hour.

      Make sure you add your query to OpsTools/queries/index.ts and then reference it 
      in queryId argument

      Usage:
      npx ts-node OpsTools/batchQuery.ts --cancelRunningQueries=true --queryId="CostBasedThrottlesQuery"
      `
    )
    .option("cancelRunningQueries", {
      describe: "Cancel running queries",
      default: true,
      type: "boolean",
      demandOption: false,
    })
    .option("queryId", {
      describe: "Query ID defined in queries/index.ts",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { cancelRunningQueries, queryId } = args;

  const queryConfig = getQueryConfig(queryId);

  const queries = await queryConfig.getQueries();
  if (!queries.length) {
    logger.info("No queries to run: ", JSON.stringify(queries, undefined, 2));
    return;
  }

  const accounts = Array.from(new Set(queries.map((q) => q.account)));
  const logGroupPrefixes = Array.from(
    new Set(queries.map((q) => q.logGroupPrefix))
  );
  const role = queries[0].role;

  if (cancelRunningQueries) {
    const promises = accounts
      .map((a) =>
        logGroupPrefixes.map((prefix) => {
          logger.info("Stopping running queries", a.accountId, role, prefix);
          return stopRunningQueries(a, role, prefix);
        })
      )
      .flat();
    await Promise.all(promises);
  }

  logger.info("Running Queries: ", JSON.stringify(queries, undefined, 2));

  const session = Date.now().toString();

  if (role !== StandardRoles.ReadOnly) {
    await preflightCAZ({
      accounts,
      role,
    });
  }

  const queryPromises: Promise<void>[] = [];
  for (let q of queries) {
    queryPromises.push(
      runQuery(q).then((logs) => queryConfig.handleLogs(q, logs, session))
    );

    // Avoid throttling
    await sleep(1000);
  }

  try {
    await Promise.all(queryPromises);
    logger.spinnerStop("Completed global query");
  } catch (error) {
    logger.error(error, "Failed to execute global query");
    logger.spinnerStop("Failed global query", false);
  }
}

async function runQuery({
  account,
  role,
  logGroupPrefix,
  query,
  startEndDate,
}: Query) {
  logger.info(account.accountId, "Beginning query for region");
  const cloudwatchClient = new CloudWatchLogsClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId, role),
    retryStrategy: new AdaptiveRetryStrategy(() => Promise.resolve(100), {
      retryDecider: (error) => {
        // Check if the error is a 5xx or a ThrottlingException
        return !!(
          error.name.includes("Throttling") ||
          (error.$metadata &&
            error.$metadata.httpStatusCode &&
            error.$metadata.httpStatusCode >= 500)
        );
      },
    }),
  });

  return insightsQuery(
    cloudwatchClient,
    logGroupPrefix,
    query,
    new Date(startEndDate[0]),
    new Date(startEndDate[1]),
    logger
  );
}

async function stopRunningQueries(
  account: AmplifyAccount,
  role: string,
  logGroupPrefix: string
) {
  const cloudwatchClient = new CloudWatchLogsClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId, role),
  });

  return cancelRunningQueries(cloudwatchClient, logGroupPrefix);
}

main().then(logger.info).catch(logger.error);
