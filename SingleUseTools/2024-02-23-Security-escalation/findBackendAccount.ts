import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import fs from "fs";
import log from "../../Commons/utils/logger";
import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getAppIdsForAccount } from "../../Commons/dynamodb";
import {
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Stage,
  preflightCAZ,
  AmplifyAccount,
} from "../../Commons/Isengard";

/*
This ops tool receives a file with accountId and output a file of
 account ids from the list that have at least 1 app with one or more backend environments across all regions.

Example for how to run it

npm run findBackendAccount -- \
--stage prod \
--inputFile input.txt \
--outputFile output.txt

Example of input.txt

[accountId1]
[accountId2]
*/

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
            This ops tool receives a file with accountId and output a file of
            account ids from the list that have at least 1 app with one or more backend environments across all regions.
            ts-node findBackendAccount --stage prod --inputFile input.txt --outputFile out.txt
            ts-node findBackendAccount --stage prod --inputFile HostingInputAccountIds.txt --outputFile out.txt
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
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

  const { inputFile, outputFile, stage } = args;
  const accounts = await controlPlaneAccounts({ stage: stage as Stage });
  await preflightCAZ({ accounts: accounts, role: "FullReadOnly" });

  const customerAccountIdFile = fs.readFileSync(inputFile, "utf-8");
  const customerAccountIdList = customerAccountIdFile.split(/\r?\n/);
  const outputCustomerAccountId = new Set<String>();

  const promises = [];
  for (let account of accounts) {
    const credentials = getIsengardCredentialsProvider(
      account.accountId,
      "FullReadOnly"
    );
    const dynamodbClient = new DynamoDBClient({
      region: account.region,
      credentials,
    });
    const dynamodb = DynamoDBDocumentClient.from(dynamodbClient);

    promises.push(
      checkRegion(
        dynamodb,
        account,
        customerAccountIdList,
        outputCustomerAccountId
      )
    );
  }

  await Promise.all(promises);

  // Write customer accounts list to output file
  const content = Array.from(outputCustomerAccountId).join("\n");
  fs.writeFileSync(outputFile, content, "utf-8");
};

const checkRegion = async (
  dynamodb: DynamoDBDocumentClient,
  account: AmplifyAccount,
  customerAccountIdList: String[],
  outputCustomerAccountId: Set<String>
) => {
  log.info(`Start query in ${account.region}`);
  let counter = 0;
  for (const customerAccountId of customerAccountIdList) {
    counter++;
    if (counter % 5000 == 0) {
      log.info(
        `Current progress for ${account.region} is ${counter}/${customerAccountIdList.length} `
      );
    }
    if (customerAccountId.length != 12) {
      log.error(`Wrong accountId ${customerAccountId}`);
      continue;
    }
    if (outputCustomerAccountId.has(customerAccountId)) {
      continue;
    }

    // Get all apps for this account in current region
    const appIds = await getAppIdsForAccount(
      dynamodb,
      account.stage,
      account.region,
      customerAccountId as string
    );

    // Check if app has backend environment
    let backendEnvCounter = 0;
    for (const appId of appIds) {
      const backend = await dynamodb.send(
        new QueryCommand({
          TableName: `${account.stage}-${account.region}-BackendEnvironment`,
          KeyConditionExpression: "appId = :appId",
          ExpressionAttributeValues: {
            ":appId": {
              S: appId,
            },
          },
        })
      );

      if (backend.Items && backend.Items.length > 0) {
        // Same app has multiple backend envs will be consider as single occurrence
        backendEnvCounter++;
      }

      // Save accountId to the output list if it has two or more backend environments
      if (backendEnvCounter >= 2) {
        log.info(
          `Found two or more backend environments for customer: ${customerAccountId} in region ${account.region}`
        );
        outputCustomerAccountId.add(customerAccountId);
        break;
      }
    }
  }
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
