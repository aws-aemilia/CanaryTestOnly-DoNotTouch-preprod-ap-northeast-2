import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MeteringServiceClient } from "../libs/Metering";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
ts-node publishSqsEvents --stage gamma --region ap-northeast-2 --messagesFile "artifacts/deactivateMessages-ap-northeast-2.txt" --dryRun

// deactivateMessage.txt
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000008/5gg67h6dsjem5mke3z4qnz2ymi","storageBytes":null}
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000009/rasueqbpjngxbef2eytrfkjztm","storageBytes":null}
{"messageVersion":"1","httpResponseCode":null,"accountId":"421585113764","branchArn":"arn:aws:amplify:eu-central-1:421585113764:apps/d3srrf2bhdj8b6/branches/f/ELK-9_lobby_view","operation":"DELETE","platformToken":null,"productCode":null,"actionType":"STOP","usageType":"EUC1-DataStorage","storagePathPrefix":"d3srrf2bhdj8b6/f/ELK-9_lobby_view/0000000010/iliip3j7bvcvzbibxttp3573yq","storageBytes":null}
      `
    )
    .option("stage", {
      describe: "gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("messagesFile", {
      describe: "file containing messages to send",
      type: "string",
      demandOption: true,
    })
    .option("dryRun", {
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { messagesFile, stage, region, dryRun } = args;
  if (stage !== "gamma" && stage !== "prod") {
    return;
  }

  const fileStream = fs.createReadStream(messagesFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const client = new MeteringServiceClient(stage, region, dryRun);
  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    await client.sendMessage("hosting-storage", line, String(lineNum));
  }
}

main().then(console.log).catch(console.error);
