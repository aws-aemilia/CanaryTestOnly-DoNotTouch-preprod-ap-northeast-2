import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
} from "Commons/Isengard";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";
import { RollbackAppsCommand } from "./commands";
import logger from "Commons/utils/logger";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
      Rolls back the environment variable update for all apps in the given stage and region. Removes the environment variable
      named '_CUSTOM_IMAGE' from each app. The rollback is performed using a conditional expression to ensure that the
      environment variable is only removed if it exists in the environment variable for the app and is set to the value of
      'amplify:al2'.

      Example:
      # Rollback all apps in the prod stage in the pdx region.
      brazil-build MCM-96985183-rollback -- --stage prod --region pdx

      # Rollback a single app in the prod stage in the pdx region.
      brazil-build MCM-96985183-rollback -- --stage prod --region pdx --appId d3rbs9i1iy9lcn

      # Rollback all apps in the beta stage in the pdx region.
      brazil-build MCM-96985183-rollback -- --stage beta --region pdx
      `
    )
    .option("stage", {
      describe: "beta, gamma, preprod or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "Optionally run the command for a single app",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region);

  await preflightCAZ({
    role: "AL2023MCMRole",
    accounts: [await controlPlaneAccount(stage, region)],
  });

  const credentials = getIsengardCredentialsProvider(
    (await controlPlaneAccount(stage, region)).accountId,
    "AL2023MCMRole"
  );

  const { appId } = args;

  const rollbackAppsCommand = await RollbackAppsCommand.buildDefault(
    stage,
    region,
    credentials
  );
  await rollbackAppsCommand.execute(appId);
}

main().catch((err) => {
  logger.error(err, "The command failed to execute");
  process.exit(1);
});
