import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AdaptiveRetryStrategy } from "@aws-sdk/middleware-retry";
import { createLogger } from "Commons/utils/logger";
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

const logger = createLogger();

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
    console.info("No queries to run: ", JSON.stringify(queries, undefined, 2));
    return;
  }

  const accounts = Array.from(new Set(queries.map((q) => q.account)));
  const logGroupPrefixes = Array.from(
    new Set(queries.map((q) => q.logGroupPrefix))
  );
  const role = queries[0].role;

  if (role !== StandardRoles.ReadOnly) {
    await preflightCAZ({
      accounts,
      role,
    });
  }

  if (cancelRunningQueries) {
    const promises = accounts
      .map((a) =>
        logGroupPrefixes.map((prefix) => {
          console.info("Stopping running queries", a.accountId, role, prefix);
          return stopRunningQueries(a, role, prefix);
        })
      )
      .flat();
    await Promise.all(promises);
  }

  console.info("Running Queries: ", JSON.stringify(queries, undefined, 2));

  const session = Date.now().toString();

  const concurrentRunner = new ConcurrentTaskRunner(30);

  const tasks = queries.map((q) => ({
    run: () =>
      runQuery(q).then((logs) => queryConfig.handleLogs(q, logs, session)),
    key: q.account.accountId,
  }));

  await concurrentRunner.run(tasks);

  console.info("Batch query successfully completed");
}

async function runQuery({
  account,
  role,
  logGroupPrefix,
  query,
  startEndDate,
}: Query) {
  console.info(account.accountId, "Beginning query for region");
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

interface Task {
  run: () => Promise<void>;
  key: string;
}

/**
 * Allows running tasks in concurrently while limiting concurrency
 */
class ConcurrentTaskRunner {
  private tasksByKey = new Map<string, number>();

  constructor(private maxConcurrencyByKey: number) {}

  public async run(tasks: Task[]): Promise<void> {
    const promises: Promise<void>[] = [];

    while (tasks.length > 0) {
      const task = tasks.pop();

      if (!task) {
        continue;
      }

      const runningTasks = this.tasksByKey.get(task.key) ?? 0;

      if (runningTasks >= this.maxConcurrencyByKey) {
        tasks.unshift(task);
        console.info("Key reached conccurrency limit:", task.key, runningTasks);
        console.info("Await existing tasks to complete:", task.key);

        await sleep(1000);
        continue;
      }

      console.info(
        "Running task with key/runningTasks:",
        task.key,
        runningTasks
      );
      const p = task
        .run()
        .catch((err) => {
          tasks.unshift(task);
          console.error("Retrying the task", task);
          console.error(err);
        })
        .finally(() => {
          const currentRunningTasks = this.tasksByKey.get(task.key);
          if (!currentRunningTasks) {
            throw new Error("No current running tasks");
          }

          this.tasksByKey.set(task.key, currentRunningTasks - 1);
          console.info(
            "Task completed with key:",
            task.key,
            currentRunningTasks
          );
        });

      this.tasksByKey.set(task.key, runningTasks + 1);
      promises.push(p);
      // Avoid throttling
      await sleep(1000);
    }

    await Promise.all(promises);
  }
}

main().then(console.info).catch(console.error);
