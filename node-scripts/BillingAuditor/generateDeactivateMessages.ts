import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MeteringServiceClient } from "../libs/Metering";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
ts-node generateDeactivateMessages --branchArnsFile "artifacts/invalidArns-ap-northeast-2.txt" --messagesOutFile "artifacts/deactivateMessages-ap-northeast-2.txt"

// branchArnsToDeactivate.txt
arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view

// deactivateMessage.txt
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000008/5gg67h6dsjem5mke3z4qnz2ymi","storageBytes":null}
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000009/rasueqbpjngxbef2eytrfkjztm","storageBytes":null}
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000010/iliip3j7bvcvzbibxttp3573yq","storageBytes":null}
      `
    )
    .option("branchArnsFile", {
      describe: "file containing branchArns to deactivate billing",
      type: "string",
      demandOption: true,
    })
    .option("messagesOutFile", {
      describe: "output file containing messages to send",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { branchArnsFile, messagesOutFile } = args;

  const branchArnsStream = fs.createReadStream(branchArnsFile);
  const outStream = fs.createWriteStream(messagesOutFile);
  const branchArnsLines = readline.createInterface({
    input: branchArnsStream,
    crlfDelay: Infinity,
  });

  for await (const branchArn of branchArnsLines) {
    const msg =
      JSON.stringify(MeteringServiceClient.generateStopMessage(branchArn)) +
      "\n";
    console.log(msg);
    outStream.write(msg);
  }
}

main().then(console.log).catch(console.error);
