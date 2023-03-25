import {
  integTestAccounts,
  controlPlaneAccount,
  Region,
  Stage,
} from "../Isengard";
import { exec } from "../utils/exec";
import confirm from "../utils/confirm";
import sleep from "../utils/sleep";
import { createLogger } from "../utils/logger";
import { buildMinervaCommand } from "./build-minerva-commands";
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
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ THIS MUST BE RUN FROM A DEV DESKTOP WITH ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ aws-minerva (MAWS) INSTALLED             ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

  Docs link:
  https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HGettingstarted:SetupyourCloudDesktoptousetheMinervaCLI
  `);

  logger.debug(
    `Found ${integrationTestAccounts.length} potential integration accounts to update`
  );

  const allMinervaCommands: string[] = [];
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

    const minervaCommand = buildMinervaCommand({
      controlPlaneAccountId: controlPlaneAccountResponse.accountId,
      integTestAccountId,
      ripServiceName,
      region,
      limitName,
      value,
    });

    allMinervaCommands.push(minervaCommand);
  }

  if (dryRun) {
    allMinervaCommands.forEach((command) => logger.info(command, "\n\n\n\n"));
    process.exit(0);
  }

  const shouldContinue = await pinoSafeConfirm(
    "All command built. Ready to run commands?"
  );
  if (!shouldContinue) {
    process.exit(1);
  }

  for (const command of allMinervaCommands) {
    logger.info(`Running command: ${command}`);
    const { stdout, stderr } = await exec(command);

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
