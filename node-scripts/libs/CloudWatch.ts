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

export async function doQuery(
  account: AmplifyAccount,
  logGroupPrefix: string,
  query: string,
  startDate: Date,
  endDate: Date
) {
  try {
    const client = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        "ReadOnly"
      ),
    });

    const logGroupName = await getLogGroup(client, logGroupPrefix);

    const command = new StartQueryCommand({
      endTime: toEpochInSeconds(endDate),
      startTime: toEpochInSeconds(startDate),
      queryString: query,
      logGroupNames: [logGroupName],
    });

    logger.info(`Starting query in region ${account.region} | ${account.airportCode}`);
    const response = await client.send(command);

    if (!response.queryId) {
      throw new Error("QueryId missing, something wrong happened");
    }

    const logs: string[] = [];
    let queryResults: GetQueryResultsCommandOutput;

    do {
      await sleep(5000);
      logger.info("Polling for query", response.queryId, account.region);
      queryResults = await client.send(
        new GetQueryResultsCommand({
          queryId: response.queryId,
        })
      );
    } while (
      queryResults.status === "Running" ||
      queryResults.status === "Scheduled"
    );

    logger.info("Query completed", account.region);

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
    logger.error("Failed to run query on region", account.region, err);
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
