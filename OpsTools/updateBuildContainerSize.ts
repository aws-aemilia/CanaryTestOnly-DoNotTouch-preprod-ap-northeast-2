import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import {
  CodeBuildClient,
  BatchGetProjectsCommand,
  UpdateProjectCommand,
} from "@aws-sdk/client-codebuild";

import {
  Region,
  Stage,
  StandardRoles,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "Commons/Isengard";
import logger from "Commons/utils/logger";

import { toRegionName } from "Commons/utils/regions";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Update build container size.

      Usage:

      npx ts-node OpsTools/updateBuildContainerSize.ts --stage gamma --region pdx --computeType BUILD_GENERAL1_MEDIUM --appId d1doshvt0occnr
      `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      demandOption: true,
      type: "string",
    })
    .option("appId", {
      describe: "Application Id",
      demandOption: true,
      type: "string",
    })
    .option("computeType", {
      describe: "container size to use",
      type: "string",
      demandOption: true,
      choices: [
        "BUILD_GENERAL1_MEDIUM",
        "BUILD_GENERAL1_LARGE",
        "BUILD_GENERAL1_XLARGE",
        "BUILD_GENERAL1_2XLARGE",
      ],
    })
    .option("dryRun", {
      describe: "skips performing actions on operations",
      default: false,
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region) as Region;

  const { dryRun, appId, computeType } = args;

  let credentials: Provider<AwsCredentialIdentity> | undefined;

  // Test accounts should use ada credentials update --account --role
  if (stage !== "test") {
    const account = await controlPlaneAccount(stage as Stage, region as Region);
    const role = StandardRoles.OncallOperator;

    await preflightCAZ({
      accounts: [account],
      role,
    });

    credentials = getIsengardCredentialsProvider(account.accountId, role);
  }

  const client = new CodeBuildClient({
    region,
    credentials,
  });

  logger.info("Fetching codebuild project data.");
  const res = await client.send(
    new BatchGetProjectsCommand({
      names: [appId],
    })
  );

  if (res.projects?.length != 1) {
    throw new Error(`Could not find project for appId=${appId}`);
  }

  const environment = res.projects[0].environment;
  if (!environment) {
    throw new Error(`Environment not set for appId=${appId}`);
  }

  logger.info({ environment }, "CodeBuild Project Environment");

  if (dryRun) {
    logger.warn("Skipping update operations");
    return;
  }

  if (environment.computeType === computeType) {
    logger.info("No changes required.");
    return;
  }

  await client.send(
    new UpdateProjectCommand({
      name: appId,
      environment: {
        ...environment,
        computeType,
      },
    })
  );

  logger.info({ appId, computeType }, "CodeBuild project updated.");
}

main().catch((err) => {
  logger.error(err, "Command execution failed");
  process.exit(1);
});
