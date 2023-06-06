import { existsSync } from "fs";
import { appendFile, mkdir, writeFile } from "fs/promises";
import path from "path";
import yargs from "yargs";
import { controlPlaneAccounts, StandardRoles } from "../commons/Isengard";
import {doQuery, insightsQuery} from "../commons/libs/CloudWatch";

async function writeLogsToFile(
  outputFolder: string,
  fileName: string,
  logs: string[]
) {
  if (!existsSync(outputFolder)) {
    await mkdir(outputFolder);
  }

  const outputFile = path.join(outputFolder, fileName);
  await writeFile(outputFile, "");

  try {
    for (const logLine of logs) {
      await appendFile(outputFile, logLine + "\n");
    }
  } catch (err) {
    console.error("Unable to write logs to file", fileName);
    console.log(logs);
  }
}

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

  const controlPlaneAccountsForStage = (await controlPlaneAccounts()).filter(
    (acc) => acc.stage === stage
  );

  const queryPromises = controlPlaneAccountsForStage.map(
    async (controlPlaneAccount) => {
      console.log(`Beginning query for region: ${controlPlaneAccount.region}`);
      const logs = await doQuery(
        controlPlaneAccount,
        logGroupPrefix,
        query,
        new Date(startDate),
        new Date(endDate),
        role
      );

      const fileName = controlPlaneAccount.region.concat(".csv");
      await writeLogsToFile(outputDir, fileName, logs || []);
    }
  );

  await Promise.all(queryPromises);
}

main().then(console.log).catch(console.error);
