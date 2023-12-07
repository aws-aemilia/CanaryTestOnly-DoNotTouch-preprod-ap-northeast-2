import {
  integTestAccounts,
  controlPlaneAccount,
  Region,
  Stage,
  preflightCAZ,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { exec } from "../../Commons/utils/exec";
import confirm from "../../Commons/utils/confirm";
import sleep from "../../Commons/utils/sleep";
import { createLogger } from "../../Commons/utils/logger";
import { updateCommand } from "./lib/build-minerva-commands";
import { toRegionName } from "../../Commons/utils/regions";
import { getArgs } from "./get-args";

async function main() {
  const {
    limitName,
    value,
    promptBetweenCommands,
    stage: filterToStage,
    dryRun,
    loggingLevel,
  } = await getArgs();
  const integrationTestAccounts = await integTestAccounts();
  const logger = createLogger(loggingLevel);

  logger.info(`
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ THIS MUST BE RUN FROM A DEV DESKTOP WITH  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ aws-minerva (MAWS) INSTALLED              ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  
  Docs link:
  https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HGettingstarted:SetupyourCloudDesktoptousetheMinervaCLI
  `);

  logger.debug(
    `Found ${integrationTestAccounts.length} potential integration accounts to update`
  );

  const sdcManagementRole = "SDCLimitManagement";

  await preflightCAZ({
    accounts: await controlPlaneAccounts({ stage: filterToStage as Stage }),
    role: sdcManagementRole,
  });

  for (const integrationTestAccount of integrationTestAccounts) {
    const {
      accountId: integTestAccountId,
      region,
      stage,
      airportCode,
    } = integrationTestAccount;

    if (filterToStage && stage !== filterToStage) {
      logger.debug({ integTestAccountId, stage, region }, "Filtered out...");
      continue;
    }

    logger.info(
      { integTestAccountId, stage, region },
      `Building minerva command...`
    );

    if (stage === "preprod") {
      logger.debug(
        { integTestAccountId, stage, region },
        "Skipping Pre-prod accounts because they have not been onboarded with minerva yet! You will need to update these manually."
      );
      continue;
    }

    if (stage === "prod" && ["mxp", "bah", "hkg"].includes(airportCode)) {
      logger.debug(
        { integTestAccountId, stage, region, airportCode },
        "Skipping region because they have not been onboarded with minerva yet! You will need to update these manually."
      );
      continue;
    }

    const ripServiceName = getRipServiceName(stage);

    logger.debug(
      { integTestAccountId, stage, region },
      `Looking up control plane account...`
    );
    const controlPlaneAccountResponse = await controlPlaneAccount(
      <Stage>stage,
      <Region>region
    );

    const regionName = toRegionName(region);

    const credentialsProvider = getIsengardCredentialsProvider(
      controlPlaneAccountResponse.accountId,
      sdcManagementRole
    );

    const credentials = await credentialsProvider();

    const minervaCommand = updateCommand({
      accountId: integTestAccountId,
      ripServiceName,
      regionName,
      limitName,
      value,
    });

    if (dryRun) {
      logger.info(minervaCommand, "\n\n\n\n");
    }

    const shouldContinue = await pinoSafeConfirm(
      "All command built. Ready to run commands?"
    );
    if (!shouldContinue) {
      process.exit(1);
    }

    logger.info(`Running command: ${minervaCommand}`);
    const { stdout, stderr } = await exec(minervaCommand, credentials);

    if (stderr) {
      logger.error(stderr);
      const shouldContinue = await pinoSafeConfirm(
        "An error occurred - do you want to continue to the next stage/region?"
      );
      if (!shouldContinue) {
        process.exit(1);
      }
    } else {
      logger.info(stdout);
      if (promptBetweenCommands) {
        const shouldContinue = await pinoSafeConfirm(
          "Continue to the next stage/region?"
        );
        if (!shouldContinue) {
          process.exit(1);
        }
      }
    }
  }
}

function getRipServiceName(stage: string) {
  if (stage === "beta") {
    return "amplify/amplify_beta";
  } else if (stage === "gamma") {
    return "amplify/amplify_gamma";
  }

  return "amplify";
}

// Required to allow all logs from pino to be output before showing the prompt
async function pinoSafeConfirm(prompt: string) {
  await sleep(100);
  return confirm(prompt);
}

main()
  .then(() => {
    console.info("All done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
