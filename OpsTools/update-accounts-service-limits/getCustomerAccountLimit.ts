import yargs from "yargs";
import { exec } from "../../Commons/utils/exec";
import { getCommand, prepareMinervaExecution } from "./build-minerva-commands";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Read the service limit for customer's account. " +
        "Example usage:\n" +
        "npx ts-node getCustomerAccountLimit.ts --region iad --accountId 386460259235 --limitName CUSTOMER_APP_PER_REGION_COUNT"
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
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limitName } = args;

  const { regionName, ripServiceName, credentials, logger } =
    await prepareMinervaExecution({
      stage,
      region,
    });

  const minervaCommand = getCommand({
    accountId,
    ripServiceName,
    regionName,
    limitName,
  });

  logger.info(`Running limit increase command: ${minervaCommand}`);
  const { stdout, stderr } = await exec(minervaCommand, credentials);

  if (stderr) {
    logger.error("An error occurred", stderr);
  } else {
    logger.info(
      `
Current customer limit: \n` +
        "```\n" +
        `${stdout}` +
        "```\n"
    );
  }
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
