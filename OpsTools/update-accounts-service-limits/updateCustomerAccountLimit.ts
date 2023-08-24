import yargs from "yargs";
import {
  controlPlaneAccount,
  Region,
  Stage,
  preflightCAZ,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { exec } from "../../Commons/utils/exec";
import { toRegionName } from "../../Commons/utils/regions";
import { createLogger } from "../../Commons/utils/logger";
import { buildMinervaCommand } from "./build-minerva-commands";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Update the service limit for customer's account. " +
        "Example usage:\n" +
        "npx ts-node updateCustomerAccountLimit.ts --region iad --accountId 386460259235 --limitName CUSTOMER_APP_PER_REGION_COUNT --value 30"
    )
    .option("stage", {
      describe: "Stage to run the command in",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "Region to run the command in (i.e. us-east-1 etc)",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "customer account id",
      type: "string",
      demandOption: true,
    })
    .option("limitName", {
      description: "Name of limit to change",
      type: "string",
      demandOption: true,
      choices: [
        "BRANCHES_PER_APP_COUNT",
        "BUILD_ARTIFACT_MAX_SIZE",
        "CACHE_ARTIFACT_MAX_SIZE",
        "CONCURRENT_JOBS_COUNT",
        "CUSTOMER_APP_PER_REGION_COUNT",
        "DOMAINS_PER_APP_COUNT",
        "ENVIRONMENT_CACHE_ARTIFACT_MAX_SIZE",
        "MANUAL_DEPLOY_ARTIFACT_MAX_SIZE",
        "SUB_DOMAINS_PER_DOMAIN_COUNT",
        "WEBHOOKS_PER_APP_COUNT",
        "MAXIMUM_APP_CREATIONS_PER_HOUR",
      ],
    })
    .option("value", {
      description: "Value to update limit with",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limitName, value } = args;

  const regionName = toRegionName(region);

  const logger = createLogger("info");

  logger.info(`
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ THIS MUST BE RUN FROM A DEV DESKTOP WITH  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ aws-minerva (MAWS) INSTALLED              ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

    Docs link:
    https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HGettingstarted:SetupyourCloudDesktoptousetheMinervaCLI
    `);

  const ripServiceName = getRipServiceName(stage);

  const controlPlaneAccountResponse = await controlPlaneAccount(
    <Stage>stage,
    <Region>region
  );

  const sdcManagementRole = "SDCLimitManagement";

  await preflightCAZ({
    accounts: controlPlaneAccountResponse,
    role: sdcManagementRole,
  });

  const credentialsProvider = getIsengardCredentialsProvider(
    controlPlaneAccountResponse.accountId,
    sdcManagementRole
  );

  const credentials = await credentialsProvider();

  const minervaCommand = buildMinervaCommand({
    accountId,
    ripServiceName,
    regionName,
    limitName,
    value,
  });

  logger.info(`Running limit increase command: ${minervaCommand}`);
  const { stdout, stderr } = await exec(minervaCommand, credentials);

  if (stderr) {
    logger.error("An error occurred", stderr);
  } else {
    logger.info(
      `
***** COPY EVERYTHING BELOW TO PASTE INTO TICKET *****
Customer limit increased: \n` +
        "```\n" +
        `${stdout}` +
        "```\n" +
        `Note: The limit is only applicable in the ${regionName} region.  If the customer would like another limit increase please make another request via the [Service Quotas dashboard](https://aws.amazon.com/blogs/mt/introducing-service-quotas-view-and-manage-your-quotas-for-aws-services-from-one-central-location/).
`
    );
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

main()
  .then(() => {
    console.info("All done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
