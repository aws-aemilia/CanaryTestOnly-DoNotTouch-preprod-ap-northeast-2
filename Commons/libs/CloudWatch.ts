import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandOutput,
  DescribeQueriesCommand,
  DescribeQueriesCommandOutput,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
  QueryStatus,
  StartQueryCommand,
  StopQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { BaseLogger, pino } from "pino";
import pinoPretty from "pino-pretty";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";
import sleep from "../utils/sleep";

const defaultLogger = pino(pinoPretty());

export interface Log {
  [key: string]: string;
}

/**
 * Run a CloudWatch Logs Insights query, wait for it to complete,
 * and returns the results as a list of key-value pairs.
 *
 * @param client CloudWatchLogsClient instance
 * @param logGroupPrefix A prefix of the log group name to search for
 * @param query Query to run
 * @param startDate Start time of the query
 * @param endDate End time of the query
 * @returns An array of logs
 */
export async function insightsQuery(
  client: CloudWatchLogsClient,
  logGroupPrefix: string,
  query: string,
  startDate: Date,
  endDate: Date,
  logger: BaseLogger = defaultLogger
): Promise<Log[]> {
  try {
    const logGroupNames = await getLogGroups(client, logGroupPrefix, logger);

    const command = new StartQueryCommand({
      endTime: toEpochInSeconds(endDate),
      startTime: toEpochInSeconds(startDate),
      queryString: query,
      logGroupNames,
    });

    logger.info("Starting log insights query");
    const response = await client.send(command);

    if (!response.queryId) {
      throw new Error("QueryId missing, something wrong happened");
    }

    let queryResults: GetQueryResultsCommandOutput;

    do {
      await sleep(500);
      queryResults = await client.send(
        new GetQueryResultsCommand({
          queryId: response.queryId,
        })
      );
    } while (
      queryResults.status === "Running" ||
      queryResults.status === "Scheduled"
    );

    logger.info("Query completed. Fetching final results");
    queryResults = await client.send(
      new GetQueryResultsCommand({
        queryId: response.queryId,
      })
    );

    if (!queryResults.results || queryResults.results.length === 0) {
      logger.info("No results found");
      return [];
    }

    const logs: Log[] = [];

    for (const columns of queryResults.results) {
      const log: Log = {};
      for (const column of columns) {
        if (column.field && column.field !== "@ptr") {
          // @ptr is a pointer to this log line (unnecessary)
          log[column.field] = column.value ?? "";
        }
      }
      logs.push(log);
    }

    return logs;
  } catch (err) {
    logger.error("Failed to run query", err);
    throw err;
  }
}

/**
 * @deprecated Use insightsQuery instead
 */
export async function doQuery(
  account: AmplifyAccount,
  logGroupPrefix: string,
  query: string,
  startDate: Date,
  endDate: Date,
  role?: string,
  logger: BaseLogger = defaultLogger
) {
  try {
    const client = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        role || "FullReadOnly"
      ),
    });

    const logGroupNames = await getLogGroups(client, logGroupPrefix, logger);

    const command = new StartQueryCommand({
      endTime: toEpochInSeconds(endDate),
      startTime: toEpochInSeconds(startDate),
      queryString: query,
      logGroupNames,
    });

    logger.info(
      `Starting query in region ${account.region} | ${account.airportCode}`
    );
    const response = await client.send(command);

    if (!response.queryId) {
      throw new Error("QueryId missing, something wrong happened");
    }

    const logs: string[] = [];
    let queryResults: GetQueryResultsCommandOutput;

    do {
      await sleep(5000);
      logger.info(`Polling for query ${response.queryId} | ${account.region}`);
      queryResults = await client.send(
        new GetQueryResultsCommand({
          queryId: response.queryId,
        })
      );
    } while (
      queryResults.status === "Running" ||
      queryResults.status === "Scheduled"
    );

    logger.info(`Query completed ${account.region}`);

    console.log("Found results: ", queryResults.results?.length);
    if (queryResults.results) {
      for (const logLine of queryResults.results) {
        // iterating over rows
        let line: string[] = [];
        for (const resultField of logLine) {
          if (resultField.field !== "@ptr") {
            line.push(resultField.value || "");
          }
        }
        logs.push(line.join(","));
      }
    } else {
      logger.info(`Results not found for ${account.region}`);
    }

    return logs;
  } catch (err) {
    logger.error(`Failed to run query on region ${account.region} | ${err}`);
  }
}

function toEpochInSeconds(date: Date): number {
  return date.getTime() / 1000;
}

export async function getLogGroups(
  cwLogsClient: CloudWatchLogsClient,
  logPrefix: string,
  logger: BaseLogger = defaultLogger
): Promise<string[]> {
  let nextToken: string | undefined;
  let response: DescribeLogGroupsCommandOutput;

  do {
    response = await cwLogsClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: logPrefix,
        nextToken,
      })
    );

    if (response.nextToken) {
      nextToken = response.nextToken;
    }
  } while (nextToken);

  if (!response.logGroups) {
    throw new Error("Log group does not exist");
  }

  const logGroups = response.logGroups;
  const logGroupsWithPrefix = logGroups.filter((logGroup) =>
    logGroup.logGroupName?.startsWith(logPrefix)
  );
  const logGroupNames = logGroupsWithPrefix
    .map((logGroup) => logGroup.logGroupName)
    .filter((x) => !!x) as string[];

  if (!logGroupNames.length) {
    throw new Error(`Log group with prefix ${logPrefix} not found`);
  }

  logger.info(`Found log group ${logGroupNames.join(",")}`);
  return logGroupNames;
}

export async function cancelRunningQueries(
  client: CloudWatchLogsClient,
  logGroupPrefix: string,
  logger: BaseLogger = defaultLogger
): Promise<string[]> {
  const logGroupNames = await getLogGroups(client, logGroupPrefix, logger);

  let nextToken: string | undefined;
  let response: DescribeQueriesCommandOutput;

  do {
    response = await client.send(
      new DescribeQueriesCommand({
        nextToken,
        logGroupName: logGroupNames[0],
        status: QueryStatus.Running,
      })
    );

    if (response.nextToken) {
      nextToken = response.nextToken;
    }
  } while (nextToken);

  const runningQueries =
    response.queries
      ?.filter((q) => q.status === QueryStatus.Running)
      .map((q) => q.queryId!) ?? [];

  for (let queryId of runningQueries) {
    logger.info("Stopping query", queryId);
    response = await client.send(new StopQueryCommand({ queryId }));
  }

  return runningQueries;
}
