import {
  DynamoDB,
  paginateQuery,
  QueryCommandInput,
  AttributeValue,
} from "@aws-sdk/client-dynamodb";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Commons/Isengard";
import { toRegionName, toAirportCode } from "../Commons/utils/regions";
const fs = require("fs");

const LOWERCASE_STAGE: Stage = "prod";
// const LOWERCASE_STAGE: Stage = "gamma";

async function listAppsWithGivenAccountsInDDB(
  accountIds: string[],
  region: Region
) {
  const airportCode = toAirportCode(region);
  const regionName = toRegionName(region);

  const controlPlaneAccount_ = await controlPlaneAccount(
    LOWERCASE_STAGE,
    airportCode
  );

  const role = LOWERCASE_STAGE === "prod" ? "FullReadOnly" : "ReadOnly";
  const dynamoDB = new DynamoDB({
    region: regionName,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount_.accountId,
      role
    ),
  });
  const accountIdsWithAmplifyApps: string[] = [];
  for (const accountId of accountIds) {
    console.log("querying accountId", accountId);
    const queryCommandInput: QueryCommandInput = {
      TableName: [LOWERCASE_STAGE, regionName, "App"].join("-"),
      Select: "SPECIFIC_ATTRIBUTES",
      ProjectionExpression: "appId",
      IndexName: "accountId-appId-index",
      KeyConditionExpression: "accountId = :accountId",
      ExpressionAttributeValues: {
        ":accountId": {
          S: accountId,
        },
      },
      Limit: 1000,
    };

    let items: Record<string, AttributeValue>[] = [];
    for await (const page of paginateQuery(
      { client: dynamoDB },
      queryCommandInput
    )) {
      page.Items;
      items.push(...(page.Items || []));
    }
    if (items.length > 0) {
      accountIdsWithAmplifyApps.push(accountId);
    }
  }

  return accountIdsWithAmplifyApps;
}

async function getArgs() {
  return (await yargs(hideBin(process.argv))
    .usage(
      "Detect if any of the given accounts have an app deployed in the given region"
    )
    .option("region", {
      describe: `Region to check (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
      demandOption: true,
      alias: "r",
    })
    .option("filename", {
      describe: `json file containing the accounts list [ "123456789", "234567891", ... ]`,
      type: "string",
      demandOption: true,
      alias: "f",
    })
    .strict()
    .version(false)
    .help().argv) as {
    region: Region;
    filename: string;
  };
}

async function main() {
  const { region, filename } = await getArgs();
  const accounts = JSON.parse(fs.readFileSync(filename, "utf8"));
  const result = await listAppsWithGivenAccountsInDDB(accounts, region);
  console.log(`The following accounts have an app in ${region}`, result);
}

// example: npx ts-node accountHasAppInRegion.ts --region iad --filename accounts1.json
main()
  .then()
  .catch((e) => console.warn(e));
