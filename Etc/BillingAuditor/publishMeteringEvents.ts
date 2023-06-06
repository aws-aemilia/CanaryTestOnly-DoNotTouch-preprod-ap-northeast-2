import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MeteringServiceClient } from "../../commons/libs/Metering";
import sleep from "../../commons/utils/sleep";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
ada credentials update --account 301051227175 --role OncallOperator --once
ts-node publishMeteringEvents --stage prod --region ca-central-1 --messagesFile "out-3/us-east-2-deactivateMessages.txt" --dryRun


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

  const client = new MeteringServiceClient(stage, dryRun);
  let lineNum = 0;
  let batchId = 0;
  let batch: string[] = [];

  let startTime = Date.now();

  for await (const line of rl) {
    lineNum++;
    batch.push(line);
    if (batch.length == 10) {
      batchId++;
      await client.batchSendMessage(
        `${batchId}`,
        "hosting-storage",
        batch,
        String(lineNum)
      );

      console.log("Messages sent = ", lineNum, new Date().toISOString());
      batch = [];
      sleep(100);
    }
  }

  // send remaining items
  if (batch.length > 0) {
    batchId++;
    await client.batchSendMessage(
      `${batchId}`,
      "hosting-storage",
      batch,
      String(lineNum)
    );

    batch = [];
  }
  console.log("Messages sent = ", lineNum, new Date().toISOString());

  console.info("Runtime: ", Date.now() - startTime);
}

main().then(console.log).catch(console.error);
