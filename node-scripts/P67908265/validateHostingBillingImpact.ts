import { RateLimiter } from "limiter";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { Credentials, Provider } from "@aws-sdk/types";
import {
  CloudWatchLogsClient,
  DescribeLogStreamsCommand,
  DescribeLogStreamsCommandOutput,
  GetLogEventsCommand,
  GetLogEventsCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";

import { getArgs, getKinesisAccount, getRegion } from "./context";
import { getIsengardCredentialsProvider } from "../Isengard";
import { customers } from "./customer";
import { composeP } from "ramda";

const { default: PQueue } = require("p-queue");
require("console-stamp")(console, "[HH:MM:ss.l]");

interface UsageObject {
  [accountId: string]: {
    [appId: string]: number;
  };
}

async function run() {
  const args = getArgs();
  const region = getRegion(args);

  console.log(`Starting log retrieval for region: ${region}`);

  await getLogs(region);
}

async function getLogs(region: string) {
  const account = getKinesisAccount(region);

  const { accountId } = account;

  const credentials = getIsengardCredentialsProvider(accountId);

  console.log(`Retrieved credentials for ${region}`);

  const logGroupName =
    "/aws/fargate/AmplifyHostingKinesisConsumer-Prod/customer_metrics.log";

  if (!existsSync(`${__dirname}/output/${region}`)) {
    mkdirSync(`${__dirname}/output/${region}`);
  }

  if (!existsSync(`${__dirname}/output/${region}/usage-data`)) {
    mkdirSync(`${__dirname}/output/${region}/usage-data`);
  }

  if (!existsSync(`${__dirname}/output/${region}/log-streams`)) {
    const client = new CloudWatchLogsClient({
      region,
      credentials,
      maxAttempts: 8,
    });

    const logStreamNames = await getLogStreamNames(client, logGroupName);

    console.log(
      `Found ${logStreamNames.length} log streams for region: ${region}`
    );

    writeFileSync(
      `${__dirname}/output/${region}/log-streams`,
      logStreamNames.join("\n")
    );
  }

  const logStreamNames = readFileSync(
    `${__dirname}/output/${region}/log-streams`
  )
    .toString()
    .split("\n");

  await processLogStreamQueue(
    region,
    credentials,
    logGroupName,
    logStreamNames
  );
}

async function getLogStreamNames(
  client: CloudWatchLogsClient,
  logGroupName: string
) {
  let nextToken: string | undefined;
  let response: DescribeLogStreamsCommandOutput;

  const logStreamNames: string[] = [];

  const limiter = new RateLimiter({
    tokensPerInterval: 5,
    interval: "second",
  });

  let exception = false;

  do {
    exception = false;

    try {
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests < 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (e) {
      // If we somehow exceed the rate, we'll wait 1 second before retrying
      console.error(`Rate exceeded`, e);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      response = await client.send(
        new DescribeLogStreamsCommand({
          logGroupName,
          nextToken,
        })
      );

      if (response.logStreams) {
        console.log(`Found ${response.logStreams?.length} log streams`);
        response.logStreams.map((logStream) => {
          if (logStream.logStreamName) {
            logStreamNames.push(logStream.logStreamName);
          }
        });
      }

      nextToken = response.nextToken;

      if (nextToken) {
        console.log(`There are more log streams...`);
      }
    } catch (e) {
      if (
        (e as AWS.AWSError).code === "ThrottlingException" ||
        (e as AWS.AWSError).code === "RequestLimitExceeded"
      ) {
        console.error(
          `ThrottlingException while retrieving logEvents in getLogEvents`,
          e
        );
        exception = true;
        continue;
      }
      throw e;
    }
  } while (nextToken || exception);

  return logStreamNames;
}

async function processLogStreamQueue(
  region: string,
  credentials: Provider<Credentials>,
  logGroupName: string,
  logStreamNames: string[]
) {
  const completedLogStreamNames = new Set();

  if (existsSync(`${__dirname}/output/${region}/log-streams-completed`)) {
    readFileSync(`${__dirname}/output/${region}/log-streams-completed`)
      .toString()
      .split("\n")
      .map((l) => completedLogStreamNames.add(l));
  }

  const limiter = new RateLimiter({
    tokensPerInterval: 50,
    interval: "second",
  });

  const queue = new PQueue({
    concurrency: 100,
  });

  queue.on("add", () =>
    console.log(
      `Task is added.  Size: ${queue.size}  Pending: ${queue.pending}`
    )
  );
  queue.on("next", () => {
    console.log(
      `Task is completed.  Size: ${queue.size}  Pending: ${queue.pending}`
    );
  });
  queue.on("error", (e: Error) => console.error(`Task error`, e));

  for (const logStreamName of logStreamNames) {
    if (completedLogStreamNames.has(logStreamName)) {
      console.log(
        `Skipping log stream ${logStreamName} since it was completed already`
      );
      continue;
    }

    queue
      .add(async () => {
        console.log(`Retrieving log events for log stream ${logStreamName}`);

        await getLogEventsFromLogStream(
          region,
          credentials,
          logGroupName,
          logStreamName,
          limiter
        );
      })
      .catch((err: Error) => console.error(`Error adding to queue`, err));
  }

  await queue.onIdle();
  console.log(`Completed processing all logStreams in queue`);
}

async function getLogEventsFromLogStream(
  region: string,
  credentials: Provider<Credentials>,
  logGroupName: string,
  logStreamName: string,
  limiter: RateLimiter
) {
  const client = new CloudWatchLogsClient({
    region,
    credentials,
    maxAttempts: 8,
  });

  const usageObject: UsageObject = {};

  await getLogEvents(client, logGroupName, logStreamName, limiter, usageObject);

  console.log(`Completed finding log events for log stream: ${logStreamName}`);

  if (Object.keys(usageObject).length > 0) {
    console.log(`Writing usage data for log stream ${logStreamName}`);
    writeUsageDataToFile(region, logStreamName, usageObject);
  }

  appendFileSync(
    `${__dirname}/output/${region}/log-streams-completed`,
    `${logStreamName}\n`
  );
}

async function getLogEvents(
  client: CloudWatchLogsClient,
  logGroupName: string,
  logStreamName: string,
  limiter: RateLimiter,
  usageObject: UsageObject
) {
  let nextForwardToken: string | undefined;
  let response: GetLogEventsCommandOutput;

  let exception = false;
  let i = 0;

  do {
    i += 1;
    exception = false;

    try {
      const remainingRequests = await limiter.removeTokens(1);
      if (remainingRequests < 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (e) {
      // If we somehow exceed the rate, we'll wait 1 second before retrying
      console.error(`Rate exceeded`, e);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      console.time(`GetLogEvents: ${logStreamName}-${i}`);
      response = await client.send(
        new GetLogEventsCommand({
          logGroupName,
          logStreamName,
          startFromHead: true,
          nextToken: nextForwardToken,
          startTime: 1612166400000,
          endTime: 1658818800000,
        })
      );
      console.timeEnd(`GetLogEvents: ${logStreamName}-${i}`);

      if (response.events) {
        console.log(
          `Found ${response.events.length} log events for log stream: ${logStreamName}`
        );
        response.events.map((event) => {
          const { message } = event;

          if (message) {
            let appId = "";
            let accountId = "";
            let bytes = 0;

            const messageParts = message.split("\n");

            if (messageParts.length > 0) {
              if (messageParts[1]) {
                const appParts = messageParts[1].split("App=");
                if (appParts.length > 0 && appParts[1]) {
                  appId = appParts[1];
                }
              }

              if (messageParts[2]) {
                const accountParts = messageParts[2].split("AWSAccountId=");
                if (accountParts.length > 0 && accountParts[1]) {
                  accountId = accountParts[1];
                }
              }

              if (messageParts[6]) {
                const metricParts = messageParts[6].split("MetricData=");
                if (metricParts.length > 0 && metricParts[1]) {
                  const bytesDownloadedParts =
                    metricParts[1].split("BytesDownloaded=");

                  if (
                    bytesDownloadedParts.length > 0 &&
                    bytesDownloadedParts[1]
                  ) {
                    const bytesParts = bytesDownloadedParts[1].split(" B;");

                    if (
                      bytesParts.length > 0 &&
                      bytesParts[0] &&
                      !isNaN(+bytesParts[0])
                    ) {
                      bytes = +bytesParts[0];
                    }
                  }
                }
              }
            }

            if (appId && accountId && bytes) {
              if (customers.has(accountId)) {
                if (usageObject[accountId]) {
                  if (usageObject[accountId][appId]) {
                    usageObject[accountId][appId] += bytes;
                  } else {
                    usageObject[accountId][appId] = bytes;
                  }
                } else {
                  usageObject[accountId] = {};
                  usageObject[accountId][appId] = bytes;
                }
              }
            }
          }
        });
      }

      if (nextForwardToken === response.nextForwardToken) {
        console.log(`Found all log events for log stream: ${logStreamName}`);
        nextForwardToken = undefined;
      } else {
        nextForwardToken = response.nextForwardToken;
      }

      if (nextForwardToken) {
        console.log(
          `There are more log events for log stream: ${logStreamName}`
        );
      }
    } catch (e) {
      if (
        (e as AWS.AWSError).code === "ThrottlingException" ||
        (e as AWS.AWSError).code === "RequestLimitExceeded"
      ) {
        console.error(
          `ThrottlingException while retrieving logEvents in getLogEvents`,
          e
        );
        exception = true;
        continue;
      }
      throw e;
    }
  } while (nextForwardToken || exception);
}

function writeUsageDataToFile(
  region: string,
  logStreamName: string,
  usageObject: UsageObject
) {
  const fileName = logStreamName.split("/")[0];

  writeFileSync(
    `${__dirname}/output/${region}/usage-data/${fileName}`,
    "accountId,appId,bytes\n"
  );

  Object.keys(usageObject).forEach((accountId) => {
    const appIds = usageObject[accountId];

    Object.keys(appIds).forEach((appId) => {
      const bytes = usageObject[accountId][appId];

      appendFileSync(
        `${__dirname}/output/${region}/usage-data/${fileName}`,
        `${accountId},${appId},${bytes}\n`
      );
    });
  });
}

process
  .on("unhandledRejection", (reason, p) => {
    console.error(reason, "Unhandled Rejection at Promise", p);
  })
  .on("uncaughtException", (err) => {
    console.error(err, "Uncaught Exception thrown");
  });

run().catch((e) => console.error(e));
