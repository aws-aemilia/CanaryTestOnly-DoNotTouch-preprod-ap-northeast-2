import { existsSync, mkdirSync, writeFileSync } from "fs";
import logger from "./commons/utils/logger";
import path from "path";
import yargs from "yargs";
import {
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  StandardRoles,
} from "./commons/Isengard";
import { insightsQuery } from "./commons/libs/CloudWatch";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Run a CloudWatch logs query in all Control Plane accounts

      Usage:
      brazil-build globalQuery \
        --stage prod \
        --logGroupPrefix AWSCodeBuild \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --ticket V123456789 \
        --query 'fields @timestamp, @message, @logStream | filter strcontains(@message, "Node version not available")'
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
      describe:
        "Folder where to write the CSV files that contain query results",
      type: "string",
      default: "globalQueryOutput",
      demandOption: false,
    })
    .option("ticket", {
      describe:
        "SIM ticket for FullReadOnly role usage. Providing a ticket will switch to FullReadOnly role instead of ReadOnly.",
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
    startDate,
    endDate,
    outputDir,
    ticket,
  } = args;

  let role = StandardRoles.ReadOnly;
  if (ticket) {
    process.env.ISENGARD_SIM = ticket;
    role = StandardRoles.FullReadOnly;
  }

  if (!existsSync(outputDir)) {
    logger.info("Output directory does not exist, creating it");
    mkdirSync(outputDir, { recursive: true });
    logger.info(outputDir, "Output directory created successfully");
  }

  const controlPlaneAccountsForStage = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === stage
  );

  const queryPromises = controlPlaneAccountsForStage.map(
    async (controlPlaneAccount) => {
      logger.info(controlPlaneAccount, "Beginning query for region");
      const cloudwatchClient = new CloudWatchLogsClient({
        region: controlPlaneAccount.region,
        credentials: getIsengardCredentialsProvider(
          controlPlaneAccount.accountId,
          "FullReadOnly"
        ),
      });

      const logs = await insightsQuery(
        cloudwatchClient,
        logGroupPrefix,
        query,
        new Date(startDate),
        new Date(endDate)
      );

      const fileName = controlPlaneAccount.region.concat(".json");
      const outputFile = path.join(outputDir, fileName);

      logger.info(outputFile, "Writing results to file");
      await writeFileSync(outputFile, JSON.stringify(logs, null, 2));
    }
  );

  await Promise.all(queryPromises);
}

main().then(console.log).catch(console.error);
