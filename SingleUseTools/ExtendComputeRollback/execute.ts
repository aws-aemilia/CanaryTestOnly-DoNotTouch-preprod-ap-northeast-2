import yargs from "yargs";
import logger from "../../Commons/utils/logger";
import {
  Stage,
  controlPlaneAccount,
  computeServiceControlPlaneAccount,
  dataPlaneAccount,
  preflightCAZForAccountRoleCombinations,
} from "../../Commons/Isengard";
import { toRegionName } from "Commons/utils/regions";
import { RollbackAppCommand, RollbackRegionCommand } from "./lib";
import { HostingConfigDAO, BranchDAO, EdgeConfigDAO } from "Commons/dynamodb";

/**
 * Script to rollback the relase of the Extending Compute project: MCM-90520740.
 * It finds the branches that are using Next.js and that have RoutingRules in the
 * HostingConfig table and deletes those RoutingRules. This makes the Hosting
 * Gateway fallback to the old behavior of routing using the NextJSMiddleware.
 */
async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Use for MCM-90520740 execution only. " +
        "Removes the RoutingRules for compute branches that are using Next.js"
    )
    .option("stage", {
      describe: "Stage to run the command",
      type: "string",
      default: "beta",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "If provided, it will only rollback this App",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { appId, stage, region } = args;
  const regionName = toRegionName(region);
  const stageName = stage as Stage;

  await preflightCAZForAccountRoleCombinations([
    {
      account: await controlPlaneAccount(stageName, regionName),
      role: "FullReadOnly",
    },
    {
      account: await computeServiceControlPlaneAccount(stageName, regionName),
      role: "ReadOnly",
    },
    {
      account: await dataPlaneAccount(stageName, regionName),
      role: "ExtendComputeRollback",
    },
  ]);

  const edgeConfigTable = new EdgeConfigDAO(stageName, regionName);
  const branchTable = await BranchDAO.buildDefault(stage, regionName);
  const hostingConfigTable = new HostingConfigDAO(
    stageName,
    regionName,
    "ExtendComputeRollback"
  );

  if (appId) {
    const rollback = new RollbackAppCommand(
      branchTable,
      hostingConfigTable,
      edgeConfigTable
    );
    logger.info("Starting rollback for a single appId %s", appId);
    await rollback.execute(appId);
  } else {
    const rollback = new RollbackRegionCommand(
      branchTable,
      hostingConfigTable,
      edgeConfigTable
    );
    logger.info("Starting rollback for region %s", regionName);
    await rollback.execute();
  }
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
