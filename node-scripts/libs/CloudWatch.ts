import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandOutput,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";
import sleep from "../utils/sleep";

const logger = pino(pinoPretty());

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
  endDate: Date
): Promise<Log[]> {
  try {
    const logGroupName = await getLogGroup(client, logGroupPrefix);

    const command = new StartQueryCommand({
      endTime: toEpochInSeconds(endDate),
      startTime: toEpochInSeconds(startDate),
      queryString: query,
      logGroupNames: [logGroupName],
    });

    logger.info("Starting log insights query");
    const response = await client.send(command);

    if (!response.queryId) {
      throw new Error("QueryId missing, something wrong happened");
    }

    let queryResults: GetQueryResultsCommandOutput;

    do {
      await sleep(500);
      logger.info("Polling for query results");
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
  role?: string
) {
  try {
    const client = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        role || "FullReadOnly"
      ),
    });

    const logGroupName = await getLogGroup(client, logGroupPrefix);

    const command = new StartQueryCommand({
      endTime: toEpochInSeconds(endDate),
      startTime: toEpochInSeconds(startDate),
      queryString: query,
      logGroupNames: [logGroupName],
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

async function getLogGroup(
  cwLogsClient: CloudWatchLogsClient,
  logPrefix: string
): Promise<string> {
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
  const logGroup = logGroups.find((logGroup) =>
    logGroup.logGroupName?.startsWith(logPrefix)
  );

  if (!logGroup || !logGroup.logGroupName) {
    throw new Error(`Log group with prefix ${logPrefix} not found`);
  }

  logger.info(`Found log group ${logGroup.logGroupName}`);
  return logGroup.logGroupName;
}
