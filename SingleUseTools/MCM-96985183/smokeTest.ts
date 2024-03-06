import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";
import { SmokeTestCommand } from "./commands";
import { Stage } from "Commons/Isengard";
import logger from "Commons/utils/logger";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
      Smoke test the MCM execution. The script creates a new app and runs a build. If an appId is provided, the script will use the existing app
      and run a build for that app. The script will print a Genie link for the app at the end of the execution. The Genie link can be used to
      verify the build logs and the environment variables for the app.

      Note: The script uses the AWS credentials from the environment to create the app and run the build. Please ensure that you run
      \`ada credentials update --account --role --once\` before running the script.

      Example:
      # Smoke test by creating a new app in the pdx region.
      brazil-build MCM-96985183-smokeTest -- --stage prod --region pdx --branch main --repository https://github.com/Narrator/BugBash-Nuxt3-ExtendCompute --accessToken <accessToken>

      # Smoke test by using an existing app in the pdx region.
      brazil-build MCM-96985183-smokeTest -- --stage prod --region pdx --appId d3rbs9i1iy9lcn --branch main
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
      describe:
        "The appID to use for the test scenario. If not provided, a new app will be created",
      type: "string",
      demandOption: false,
    })
    .option("branch", {
      describe: "The GitHub branch to use for the test scenario",
      type: "string",
      demandOption: true,
    })
    .option("repository", {
      describe: "The GitHub repository url to use for the test scenario",
      type: "string",
      demandOption: false,
    })
    .option("access-token", {
      alias: "accessToken",
      describe: "The GitHub access token to use for the test scenario",
      type: "string",
      demandOption: false,
    })
    .option("endpoint", {
      describe:
        "The control plane endpoint to use for the test scenario. Useful for non-prod environments",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const region = toRegionName(args.region);
  const stage = args.stage as Stage;

  const { appId, branch, repository, accessToken, endpoint } = args;

  if (!appId && (!repository || !accessToken)) {
    throw new Error(
      "Either the appId or the repository and accessToken are required"
    );
  }

  const smokeTestCommand = await SmokeTestCommand.buildDefault(
    stage,
    region,
    branch,
    repository,
    accessToken,
    endpoint
  );
  await smokeTestCommand.execute(appId);
}

main().catch((err) => {
  logger.error(err, "The command failed to execute");
  process.exit(1);
});
