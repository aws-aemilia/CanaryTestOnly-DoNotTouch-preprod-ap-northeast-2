import yargs from "yargs";
import {
  AmplifyAccount,
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../Isengard";
import fs from "fs";
import { stopBuilds } from "./stopBuilds";

const consoleStamp = require("console-stamp");

interface ScriptInput {
  stage: Stage;
  region: Region;
  inputFile: string;
  outputDir: string;
  devAccountId?: string;
  ticket?: string;
}

/**
 * The number of accounts to process concurrently.
 */
const CONCURRENCY = 3;

const main = async () => {
  const args = (await yargs(process.argv.slice(2))
    .usage(
      `
      Cancel running builds for a given list of accounts. USE WITH CAUTION.

      This script does not ask for confirmation. It will cancel all running builds for the given accounts.
      
      Usage:
      brazil-build cancelRunningBuilds -- \
        --inputFile ./OpsTools/buildAbuse/input.txt \
        --outputDir ./OpsTools/buildAbuse/output \
        --stage=test \
        --region=us-west-2 \
        --devAccountId=357128036178

      brazil-build cancelRunningBuilds -- \
        --inputFile ./OpsTools/buildAbuse/input.txt \
        --outputDir ./OpsTools/buildAbuse/output \
        --stage=prod \
        --region=us-west-2 \
        --ticket=123456789
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
      type: "string",
      default: "us-east-1",
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .option("inputFile", {
      describe: "The path to the file where the accountIds are",
      type: "string",
      demandOption: true,
    })
    .option("outputDir", {
      describe: "The path to the directory where the logs will be written",
      type: "string",
      demandOption: true,
    })
    .option("devAccountId", {
      describe:
        "The account Id for your dev account. Use this option if you want to run this script against the 'test' stage a.k.a your local stack",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv) as ScriptInput;

  const { region, stage, inputFile, outputDir, devAccountId, ticket } = args;

  process.env.ISENGARD_SIM = ticket;

  let account: AmplifyAccount;

  if (devAccountId) {
    account = {
      accountId: devAccountId,
      region,
      stage,
    } as AmplifyAccount;
  } else {
    account = await controlPlaneAccount(stage, region);
  }

  const { accountId } = account;

  const credentials = getIsengardCredentialsProvider(
    accountId,
    "OncallOperator"
  );

  const accountIds: string[] = fs
    .readFileSync(inputFile)
    .toString()
    .split("\n");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }

  const logFileName = `stopped-builds-${stage}-${region}.log`;
  const logOutputStream = fs.createWriteStream(`${outputDir}/${logFileName}`);
  const logger = new console.Console({
    stdout: logOutputStream,
    stderr: logOutputStream,
    ignoreErrors: false,
  });

  consoleStamp(logger, {
    stdout: logOutputStream,
    stderr: logOutputStream,
  });

  await stopBuilds(
    stage,
    region,
    credentials,
    accountIds,
    CONCURRENCY,
    logger,
    false
  );

  logOutputStream.close();
};

main().then(console.log).catch(console.error);
