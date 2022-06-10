import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogGroupsCommandOutput,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
  StartQueryCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import sleep from "./utils/sleep";
import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
} from "./Isengard";

async function doQuery(
  account: AmplifyAccount,
  logGroupPrefix: string,
  query: string,
  startDate: Date,
  endDate: Date,
  outputDir: string,
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

    console.log(`Starting query in region ${account.region}`);
    const response = await client.send(command);

    if (!response.queryId) {
      throw new Error("QueryId missing, something wrong happened");
    }

    const logs: string[] = [];
    let queryResults: GetQueryResultsCommandOutput;

    do {
      await sleep(5000);
      console.log("Polling for query", response.queryId, account.region);
      queryResults = await client.send(
        new GetQueryResultsCommand({
          queryId: response.queryId,
        })
      );
    } while (
      queryResults.status === "Running" ||
      queryResults.status === "Scheduled"
    );

    console.log("Query completed", account.region);

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
      console.log(`Results not found for ${account.region}`);
    }

    const fileName = account.region.concat(".csv");
    writeLogsToFile(outputDir, fileName, logs);
  } catch (err) {
    console.error("Failed to run query on region", account.region, err);
  }
}

function writeLogsToFile(
  outputFolder: string,
  fileName: string,
  logs: string[]
) {
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
  }

  const outputFile = path.join(outputFolder, fileName);
  fs.writeFileSync(outputFile, "");

  try {
    for (const logLine of logs) {
      fs.appendFileSync(outputFile, logLine + "\n");
    }
  } catch (err) {
    console.error("Unable to write logs to file", fileName);
    console.log(logs);
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

  console.log(`Found log group ${logGroup.logGroupName}`);
  return logGroup.logGroupName;
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage("Run a CloudWatch logs query in all Control Plane accounts")
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("logGroupPrefix", {
      describe:
        "Prefix for the CW log group, for example /aws/lambda/AemiliaControlPlane-Function-",
      type: "string",
      demandOption: true,
    })
    .option("query", {
      describe: "The cloudwatch log query",
      type: "string",
      demandOption: true,
    })
    .option("startDate", {
      describe:
        "Query start date in ISO format, for example 2022-04-01T00:00:00",
      type: "string",
      demandOption: true,
    })
    .option("endDate", {
      describe: "Query end date in ISO format, for example 2022-04-01T00:00:00",
      type: "string",
      demandOption: true,
    })
    .option("outputDir", {
      describe: "Folder where to write the CSV files that contain query results",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const controlPLaneAccounts = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === args.stage
  );

  let queryPromises = [];
  for (const controlPLaneAccount of controlPLaneAccounts) {
    await sleep(2000);
    queryPromises.push(
      doQuery(
        controlPLaneAccount,
        args.logGroupPrefix,
        args.query,
        new Date(args.startDate),
        new Date(args.endDate),
        args.outputDir,
      )
    );
  }

  await Promise.all(queryPromises);
}

main();
