import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../commons/Isengard";
import { Credentials } from "@aws-sdk/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const DANGEROUS_ROLE_ALLOWING_CHANGES_TO_BE_COMMITTED = "OncallOperator";
const DRY_RUN_ROLE = "FullReadOnly";

export interface ReconcileParameters {
  appId: String;
  credentials: Credentials;
  regionalAccount: AmplifyAccount;
}

interface InputArgs {
  appId: string;
  dryRun: boolean;
  region: Region;
  stage: Stage;
}

export async function getReconcileParameters() {
  const { appId, dryRun, region, stage } = await getArgs();
  // Yargs typing gets mad if the name being used does not match the cli parameter
  const isDryRun = dryRun;

  console.log("CLI Provided settings:", {
    stage,
    region,
    appId,
    isDryRun,
  });

  const regionAccount = await controlPlaneAccount(stage, region);

  console.log(
    `Located regional account for ${stage} in region ${region}. AccountId: ${regionAccount.accountId}`
  );

  const credentials: Credentials = await getIsengardCredentialsProvider(
    regionAccount.accountId,
    isDryRun ? DRY_RUN_ROLE : DANGEROUS_ROLE_ALLOWING_CHANGES_TO_BE_COMMITTED
  )();

  return {
    appId,
    credentials,
    regionAccount,
    isDryRun,
  };
}

async function getArgs() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Removes orphaned branches from the provided AppId's LambdaEdgeConfig

        *** Don't forget to use "--" when using "npm run reconcileEdgeConfigWithBranches" ***

        Example:

        npm run reconcileEdgeConfigWithBranches -- --stage beta --region us-west-2 --app-id someappid123
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("app-id", {
      alias: "appId",
      describe: "The Amplify App ID",
      type: "string",
      demandOption: true,
    })
    .option("dry-run", {
      alias: "dryRun",
      describe: "In dry-run mode, no writes to DynamoDB will be performed",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;

  return args as InputArgs;
};
