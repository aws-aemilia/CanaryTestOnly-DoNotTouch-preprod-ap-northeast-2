import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  Region,
  Stage,
  StandardRoles,
  computeServiceDataPlaneAccounts,
  controlPlaneAccounts,
  preflightCAZ,
} from "../../Commons/Isengard";
import logger from "../../Commons/utils/logger";
import { getArgs } from "./getArgs";
import { runRequestsInAllRegions } from "./runRequestsInAllRegions";
import { SingleRegionResults } from "./types";

interface DebugSingleRequestArgs {
  problemRequestNumber: number;
  region: Region;
}

async function main() {
  const args = await getArgs();

  if (!args.problemRequestNumber) {
    console.log("You must provide the problemRequestNumber argument");
  }
  if (!args.region) {
    console.log("You must provide the region argument");
  }

  const regionResultsFileName = join(args.outputDir, `${args.region}.json`);
  const problemRequestNumber = args.problemRequestNumber;

  const regionResultsRawFileContents = await readFile(
    regionResultsFileName,
    "utf-8"
  );
  const regionResults: SingleRegionResults = JSON.parse(
    regionResultsRawFileContents
  );
  const oneProblem = regionResults.allProblems.find(
    (problem) => problem.requestNumber === problemRequestNumber
  );

  if (!oneProblem) {
    throw new Error(
      `No problem found for request number ${problemRequestNumber}`
    );
  }

  const controlPlaneAccountsForStage = await controlPlaneAccounts({
    stage: args.stage as Stage,
    region: regionResults.region as Region,
  });

  // Only use cell 1 for each region
  const cellAccountsForStage = (
    await computeServiceDataPlaneAccounts({
      stage: args.stage as Stage,
      region: regionResults.region as Region,
    })
  ).filter((oneAccount) => oneAccount.cellNumber === "1");

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

  const allRegionResults = await runRequestsInAllRegions(
    [
      {
        account: cellAccountsForStage[0],
        logs: [oneProblem.imageRequest],
      },
    ],
    controlPlaneAccountsForStage,
    cellAccountsForStage,
    args.concurrentRequestsPerRegion
  );

  await mkdir(join(args.outputDir, "debugSingleRequest"), { recursive: true });
  for (const oneRegionResult of allRegionResults) {
    if (oneRegionResult.problemCount + oneRegionResult.successCount > 0) {
      await writeFile(
        join(
          args.outputDir,
          "debugSingleRequest",
          `${oneRegionResult.region}.json`
        ),
        JSON.stringify(oneRegionResult, null, 2)
      );
    } else {
      logger.info(`No results for ${oneRegionResult.region}`);
    }
  }
}

main().then(console.log).catch(console.error);
