import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parseBranchArn } from "../commons/utils/arns";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
ts-node generateAccountsImpacted --branchArnsFile "out-1/icn-invalidBilledArns.txt" --impactedAccountsFile "out-1/icn-impacted-accounts.txt"

// branchArnsToDeactivate.txt
arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view

// deactivateMessage.txt
421585113764
421585113762
421585113124
...
      `
    )
    .option("branchArnsFile", {
      describe: "file containing branchArns to deactivate billing",
      type: "string",
      demandOption: true,
    })
    .option("impactedAccountsFile", {
      describe: "output file containing messages to send",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { branchArnsFile, impactedAccountsFile } = args;

  const branchArnsStream = fs.createReadStream(branchArnsFile);
  const impactedAccountsFileStream = fs.createWriteStream(impactedAccountsFile);
  const branchArnsLines = readline.createInterface({
    input: branchArnsStream,
    crlfDelay: Infinity,
  });

  const impactedAccounts = new Set<string>();

  for await (const branchArn of branchArnsLines) {
    const { accountId } = parseBranchArn(branchArn);
    impactedAccounts.add(accountId);
  }
  for (const accountId of impactedAccounts) {
    impactedAccountsFileStream.write(accountId + "\n");
  }
}

main().then(console.log).catch(console.error);
