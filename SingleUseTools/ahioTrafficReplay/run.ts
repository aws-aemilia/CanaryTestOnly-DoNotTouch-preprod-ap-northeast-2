import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import {
  Region,
  Stage,
  StandardRoles,
  computeServiceDataPlaneAccounts,
  controlPlaneAccounts,
  dataPlaneAccounts,
  preflightCAZ,
} from "../../Commons/Isengard";
import logger from "../../Commons/utils/logger";
import { getArgs } from "./getArgs";
import { getImageRequestsFromHgLogs } from "./getImageRequestsFromHgLogs";
import { runRequestsInAllRegions } from "./runRequestsInAllRegions";
import { SingleRegionResults } from "./types";

async function main() {
  const args = await getArgs();

  const dataPlaneAccountsForStage = await dataPlaneAccounts({
    stage: args.stage as Stage,
    region: args.region as Region,
  });

  const controlPlaneAccountsForStage = await controlPlaneAccounts({
    stage: args.stage as Stage,
    region: args.region as Region,
  });

  // Only use cell 1 for each region
  const cellAccountsForStage = (
    await computeServiceDataPlaneAccounts({
      stage: args.stage as Stage,
      region: args.region as Region,
    })
  ).filter((oneAccount) => oneAccount.cellNumber === "1");

  logger.info({ cellAccountsForStage });

  logger.info(
    "You will be prompted for multiple preflightCAZ. We are using multiple account types with different roles to ensure we are maintaining lest priviledged access."
  );

  // No preflight CAZ is required for data plane because we are using ReadOnly

  await preflightCAZ({
    accounts: controlPlaneAccountsForStage,
    role: StandardRoles.FullReadOnly,
  });

  await preflightCAZ({
    accounts: cellAccountsForStage,
    role: "LambdaInvoker",
  });

  // Get logs from hosting gateway
  //   - Run query against all regions for stage
  //   - Return object with account information and results
  const allRegionLogs = await getImageRequestsFromHgLogs(
    dataPlaneAccountsForStage,
    args
  );

  const allRegionResults = await runRequestsInAllRegions(
    allRegionLogs,
    controlPlaneAccountsForStage,
    cellAccountsForStage,
    args.concurrentRequestsPerRegion
  );

  await mkdir(args.outputDir, { recursive: true });
  for (const oneRegionResult of allRegionResults) {
    if (oneRegionResult.problemCount + oneRegionResult.successCount > 0) {
      await writeFile(
        join(args.outputDir, `${oneRegionResult.region}.json`),
        JSON.stringify(oneRegionResult, null, 2)
      );

      const csvContents = await outputGraphableData(oneRegionResult);
      await writeFile(
        join(args.outputDir, `${oneRegionResult.region}.graphable.csv`),
        csvContents
      );
    } else {
      logger.info(`No results for ${oneRegionResult.region}`);
    }
  }
}

async function outputGraphableData(oneRegionResult: SingleRegionResults) {
  // Create CSV that will be graphable in excel
  const csvLines: string[] = [];
  csvLines.push(
    "RequestNumber,Region,ImageRequestTime,AhioTimeNetwork,AhioTimeLambda"
  );
  oneRegionResult.allProblems.forEach((entry) => {
    csvLines.push(
      `${entry.requestNumber},${oneRegionResult.region},${entry.imageRequest.timeTakenMs},${entry.ahioResult?.timeTakenMs},${entry.ahioResult?.lambdaTimeTakenMs}`
    );
  });
  oneRegionResult.allSuccesses.forEach((entry) => {
    csvLines.push(
      `${entry.requestNumber},${oneRegionResult.region},${entry.imageRequest.timeTakenMs},${entry.ahioResult?.timeTakenMs},${entry.ahioResult?.lambdaTimeTakenMs}`
    );
  });

  return csvLines.join("\n");
}

main().then(console.log).catch(console.error);
