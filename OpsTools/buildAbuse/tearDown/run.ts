import { updateBlockStatusForAccountIds } from "../../../Commons/Fraud";
import yargs from "yargs";
import { getReportedAccountIds } from "./common";

async function blockAccounts(
  stage: string,
  region: string,
  accountIds: string[]
) {
  await updateBlockStatusForAccountIds(
    accountIds,
    stage,
    "BLOCK_IGNORE_CLOUDFRONT",
    "OncallOperator",
    { region }
  );
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(`
    Blocks accounts that have been reported as abusive crypto-miners by sending a BLOCK_IGNORE_CLOUDFRONT message.
    
    This tool is intended to be used to process older accounts that were reported before 04/20 by the buildAbuse tool.
    On 04/20 Control Plane was updated to delete CodeBuild Projects for blocked accounts, so simply running detectBuildAbuse.ts is enough.
    
    This tool operates exclusively on accounts present on the account_reported.json file.
    Use the --accountId and --reportedAfter flags to operate on a subset of accounts.
   `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "preprod", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "Run the tool for exactly one account",
      type: "string",
    })
    .option("reportedAfter", {
      describe:
        "Only operate on accounts reported after the provided date 2023-04-13T04:21:00.590Z",
      type: "string",
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, reportedAfter, ticket } = args;

  process.env.ISENGARD_SIM = ticket;

  const targetAccountIds = getReportedAccountIds({
    reportedAfter,
    accountId,
  });

  await blockAccounts(stage, region, targetAccountIds);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
