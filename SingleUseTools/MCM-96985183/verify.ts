import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
} from "Commons/Isengard";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";
import { VerifyAppsCommand } from "./commands";
import logger from "Commons/utils/logger";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
      Verifies the environment variable update for all apps in the given stage and region. The verification is performed by
      checking the environment variable named '_CUSTOM_IMAGE' for each app. If the environment variable exists and is set to
      the value of 'amplify:al2', the app is considered to have been updated successfully. If the environment variable does not
      exist or is set to a different value, the app is considered to have failed the update. The results of the verification
      are written to the output directory as a set of files.

      Example:
      # Verify all apps in the prod stage in the pdx region.
      brazil-build MCM-96985183-verify -- --stage prod --region pdx

      # Verify a single app in the prod stage in the pdx region.
      brazil-build MCM-96985183-verify -- --stage prod --region pdx --appId d3rbs9i1iy9lcn

      # Verify all apps in the beta stage in the pdx region.
      brazil-build MCM-96985183-verify -- --stage beta --region pdx
      `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
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

  const verifyAppsCommand = await VerifyAppsCommand.buildDefault(
    stage,
    region,
    credentials
  );
  await verifyAppsCommand.execute(appId);
}

main().catch((err) => {
  logger.error(err, "The command failed to execute");
  process.exit(1);
});
