import fs from "fs";
import readline from "readline";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { MeteringServiceClient } from "../commons/libs/Metering";
import { RemoRecordsReader } from "./RemoRecordsReader";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
ts-node generateDeactivateMessages --branchArnsFile "out-2/ap-northeast-2-invalidBilledArns.txt" --remoRecordFile "konafiles/metering-records-snapshot" --messagesOutFile "out-2/ap-northeast-2-deactivateMessages.txt"

//metering-records-snapshot
{
  "resourceId": "arn:aws:amplify:ap-northeast-1:631808478805:apps/d2l377nyzwxh55/branches/staging,APN1-DataStorage,AWSAmplify,HostingStorage,232123326645,d2l377nyzwxh55/staging/0000000039/whu4u4h76bcblb5yxkhqqammzq",
  "resource": "arn:aws:amplify:ap-northeast-1:631808478805:apps/d2l377nyzwxh55/branches/staging",
  "payerId": "232123326645",
  "platformToken": "232123326645",
  "productCode": "AWSAmplify",
  "partitionKey": "amplify-AWSAmplify-f1",
  "meteringHourTimestamp": "1591488000000",
  "markAsDeleted": "false",
  "ActivateTimestamp": "1591632594490",
  "value": "48146737",
  "operation": "HostingStorage",
  "isProrated": "true",
  "usageType": "APN1-DataStorage"
}
...

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
    .option("remoRecordFile", {
      describe: "Snapshot of all active Remo records",
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

  const { branchArnsFile, remoRecordFile, messagesOutFile } = args;

  console.info(`Reading ${branchArnsFile}`);
  const branchArnsSet = await getBranchArnsSet(branchArnsFile);
  console.info(`Found ${branchArnsSet.size} invalid branchArns`);

  const outStream = fs.createWriteStream(messagesOutFile);

  const remoRecordsReader = new RemoRecordsReader(remoRecordFile);
  remoRecordsReader.readLines(
    (line, { branchArn, usageType, storagePathPrefix }) => {
      if (!branchArn || !usageType || !storagePathPrefix) {
        throw new Error(`Invalid remoRecord ${line}`);
      }

      if (branchArnsSet.has(branchArn)) {
        const msg =
          JSON.stringify(
            MeteringServiceClient.generateStopMessage(
              branchArn,
              usageType,
              storagePathPrefix
            )
          ) + "\n";
        outStream.write(msg);
      }
    }
  );
}

async function getBranchArnsSet(branchArnsFile: string) {
  const branchArnsStream = fs.createReadStream(branchArnsFile);
  const branchArnsLines = readline.createInterface({
    input: branchArnsStream,
    crlfDelay: Infinity,
  });

  const branchArnsSet = new Set<string>();
  for await (const branchArn of branchArnsLines) {
    branchArnsSet.add(branchArn);
  }

  return branchArnsSet;
}

main().then(console.log).catch(console.error);
