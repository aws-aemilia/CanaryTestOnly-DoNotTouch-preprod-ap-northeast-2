import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { levels } from "pino";

interface GetArgsResponse {
  limitName: string;
  value: string;
  promptBetweenCommands: boolean;
  stage: string | undefined;
  dryRun: boolean;
  loggingLevel: string;
}

export async function getArgs(): Promise<GetArgsResponse> {
  return await yargs(hideBin(process.argv))
    .usage(`Update specified SDC limit in selected integration test accounts.`)
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
    .option("stage", {
      description: "Only update settings for the specified stage",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("promptBetweenCommands", {
      describe:
        "Bash script should not prompt to continue between each command",
      type: "boolean",
      default: true,
      demandOption: false,
    })
    .option("dryRun", {
      type: "boolean",
      default: false,
      demandOption: false,
    })
    .option("loggingLevel", {
      description: "Only update settings for the specified stage",
      type: "string",
      demandOption: false,
      default: "info",
      choices: Object.keys(levels.values),
    })
    .example([
      [
        "$0 --limitName CONCURRENT_JOBS_COUNT --value 200 --stage gamma",
        "Update concurrent job limit in gamma integration test accounts to 200",
      ],
      [
        "$0 --limitName CONCURRENT_JOBS_COUNT --value 200 --loggingLevel debug",
        "Update concurrent job limit in all integration test accounts to 200 with debug logging",
      ],
    ])
    .wrap(yargs.terminalWidth())
    .strict()
    .version(false)
    .help().argv;
}
