import { existsSync, mkdirSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { createSpinningLogger } from "../Commons/utils/logger";
import path from "path";
import yargs from "yargs";
import {
  AmplifyAccount,
  AmplifyAccountType,
  controlPlaneAccounts,
  getAccountsLookupFn,
  getIsengardCredentialsProvider,
  Region,
  Stage,
  StandardRoles,
} from "../Commons/Isengard";
import { insightsQuery } from "../Commons/libs/CloudWatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  getDynamoDBDocumentClient,
  mapAppIdsToCustomerAccountIds,
} from "Commons/dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { preflightCAZForAccountRoleCombinations } from "Commons/Isengard/contingentAuthZ";

const logger = createSpinningLogger();

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Run a CloudWatch logs query in any of our service accounts

      Usage:
      brazil-build globalQuery \
        --stage prod \
        --logGroupPrefix AWSCodeBuild \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --query 'fields @timestamp, @message, @logStream | filter strcontains(@message, "Node version not available")'

      Usage with query file:
      brazil-build globalQuery \
        --stage prod \
        --logGroupPrefix AWSCodeBuild \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --queryFile ./query.txt

      Usage in customerImpact mode where the query outputs a list of appIds:
      brazil-build globalQuery \
        --stage prod \
        --logGroupPrefix AWSCodeBuild \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --query 'filter @message like /No matching version/ | display @logStream |  parse @logStream "*/*" as appId, l | group by appId | display appId'
        --customerImpact
        --outputType appId

      Usage in customerImpact mode where the query outputs a list of accountIds:
      brazil-build globalQuery \
        --stage prod \
        --logGroupPrefix AWSCodeBuild \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --query 'filter isFault="true" and stepName="BUILD" and buildPhase="BuildExecution" | stats count(*) by accountId | display accountId'
        --customerImpact
      `
    )
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
      demandOption: false,
    })
    .option("queryFile", {
      describe: "file containing the cloudwatch log query",
      type: "string",
      demandOption: false,
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
      describe:
        "Folder where to write the CSV files that contain query results",
      type: "string",
      demandOption: false,
    })
    .option("role", {
      describe: "IAM Role for Query",
      type: "string",
      default: StandardRoles.ReadOnly,
      choices: [StandardRoles.ReadOnly, StandardRoles.FullReadOnly],
      demandOption: false,
    })
    .option("noEmptyFiles", {
      describe: "Only output a file if the region has matches",
      default: false,
      type: "boolean",
      demandOption: false,
    })
    .option("accountType", {
      describe:
        "The type of account i.e. controlPlane, dataPlane, computeServiceControlPlane, kinesisConsumer etc",
      choices: Object.values(AmplifyAccountType),
      default: "controlPlane",
      type: "boolean",
      demandOption: false,
    })
    .option("customerImpact", {
      describe: "Output as customer impact",
      default: false,
      type: "boolean",
      demandOption: false,
    })
    .option("outputType", {
      describe:
        "The type of output (appIds or accountIds) produced by your customer impact query",
      default: "accountId",
      choices: ["accountId", "appId"],
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const {
    stage,
    logGroupPrefix,
    query,
    queryFile,
    startDate,
    endDate,
    outputDir,
    noEmptyFiles,
    role,
    accountType,
    customerImpact,
    outputType,
  } = args;

  if (!query && !queryFile) {
    throw new Error("Either query or queryFile must be provided");
  }

  let queryToExecute = query || "";
  if (queryFile && !query) {
    queryToExecute = await readFile(path.join(__dirname, queryFile), "utf-8");
  }

  const resolveOutputFolder =
    outputDir ??
    path.join(__dirname, "..", "tmp", `query_results_${Date.now()}`);

  if (!existsSync(resolveOutputFolder)) {
    logger.info("Output directory does not exist, creating it");
    mkdirSync(resolveOutputFolder, { recursive: true });
    logger.info(outputDir, "Output directory created successfully");
  }

  const accountLookupFn =
    getAccountsLookupFn[accountType as AmplifyAccountType];
  const accountsForStage = await accountLookupFn({
    stage: stage as Stage,
  });

  let controlPlaneAccountsForStage: AmplifyAccount[] | undefined;
  if (customerImpact && outputType === "appId") {
    controlPlaneAccountsForStage = await controlPlaneAccounts({
      stage: stage as Stage,
    });
  }

  await preflightCAZForAccountRoleCombinations([
    ...accountsForStage.map((account) => ({
      account,
      role,
    })),
    ...(controlPlaneAccountsForStage?.map((account) => ({
      account,
      role: StandardRoles.FullReadOnly,
    })) ?? []),
  ]);

  let regionsLeftToGetLogsFrom = accountsForStage.length;
  logger.update(
    `Fetching global query results. Regions remaining: ${regionsLeftToGetLogsFrom}`
  );
  logger.spinnerStart();
  const queryPromises = accountsForStage.map(async (account) => {
    logger.info(account, "Beginning query for region");
    const cloudwatchClient = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(account.accountId, role),
    });

    /**
     * If the query outputs the result as a lit of appIds, we need to map the appIds to
     * the accountIds. For this, we need to talk to DynamoDB and run a query.
     */
    let dynamoDBClient: DynamoDBDocumentClient | undefined;

    if (customerImpact && outputType === "appId") {
      dynamoDBClient = getDynamoDBDocumentClient(
        account.region as Region,
        getIsengardCredentialsProvider(
          account.accountId,
          StandardRoles.FullReadOnly
        )
      );
    }

    const logs = await insightsQuery(
      cloudwatchClient,
      logGroupPrefix,
      queryToExecute,
      new Date(startDate),
      new Date(endDate),
      logger
    );

    const fileName = customerImpact
      ? account.region.concat(".txt")
      : account.region.concat(".json");
    const outputFile = path.join(resolveOutputFolder, fileName);

    regionsLeftToGetLogsFrom--;
    logger.update(
      `Fetching global query results. Regions remaining: ${regionsLeftToGetLogsFrom}`
    );

    if (logs.length === 0) {
      logger.info(`No results found for ${account.region}`);
      if (noEmptyFiles) {
        return;
      }
    }

    if (customerImpact) {
      let customerAccountIds: string[] = [];

      if (outputType === "accountId") {
        customerAccountIds.push(...logs.map((log) => log.accountId));
      } else {
        if (!dynamoDBClient) {
          throw new Error(
            "DynamoDBClient is undefined when outputType is appId. Cannot map appIds to customerAccountIds without DynamoDBClient"
          );
        }

        const appIds = logs.map((log) => log.appId);
        customerAccountIds.push(
          ...(await mapAppIdsToCustomerAccountIds(
            appIds,
            stage as Stage,
            account.region as Region,
            dynamoDBClient
          ))
        );
      }

      customerAccountIds = [...new Set(customerAccountIds)];

      logger.info({ outputFile }, "Writing results to file");
      await writeFileSync(outputFile, customerAccountIds.join("\n"));
      return;
    }

    logger.info({ outputFile }, "Writing results to file");
    await writeFileSync(outputFile, JSON.stringify(logs, null, 2));
  });

  try {
    await Promise.all(queryPromises);
    logger.spinnerStop("Completed global query");
  } catch (error) {
    logger.error(error, "Failed to execute global query");
    logger.spinnerStop("Failed global query", false);
  }
}

main().then(console.log).catch(console.error);
