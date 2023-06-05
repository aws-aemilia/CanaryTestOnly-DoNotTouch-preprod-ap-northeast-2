import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs";
import readline from "readline";
import sleep from "../commons/utils/sleep";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { lookupCustomerAccountId } from "../commons/dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../commons/Isengard";

/*
This ops tool receives a file with AppIds & DomainIds (one per line) and outputs another
file with the corresponding customer account ID for each app. 

Example for how to run it

npm run mapAppIds -- \
--stage prod \
--region ca-central-1 \
--inputFile input.txt \
--outputFile output.txt

Example of input.txt

dl41u6lnr8337
dozahly8dfb3n
d3jzq563un39r
d3rbs9i1iy9lcn
*/

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Takes a list of appIds and domainIds from a text file and finds the corresponding
        customer account ID in the DynamoDB App table. 
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
    .option("inputFile", {
      describe: "The path to the file where the appIds and domainIds are",
      type: "string",
      demandOption: true,
    })
    .option("outputFile", {
      describe: "The path to the file where output will be written",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { inputFile, outputFile, stage, region } = args;
  const account = await controlPlaneAccount(stage as Stage, region as Region);

  const fileStream = fs.createReadStream(inputFile);
  const outStream = fs.createWriteStream(outputFile);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    "FullReadOnly"
  );
  const dynamodbClient = new DynamoDBClient({ region, credentials });
  const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

  for await (const domainOrAppId of rl) {
    await sleep(100);
    const customerAccountId = await lookupCustomerAccountId(
      dynamodb,
      stage,
      region,
      domainOrAppId
    );

    if (customerAccountId) {
      outStream.write(`${domainOrAppId}\t${customerAccountId}\n`);
    }
  }

  console.log("Closing output file", outputFile);
  outStream.close();
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
