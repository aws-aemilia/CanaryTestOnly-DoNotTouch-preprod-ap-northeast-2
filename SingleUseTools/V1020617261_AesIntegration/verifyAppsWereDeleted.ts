import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { toRegionName } from "Commons/utils/regions";
import { parse } from "csv-parse/sync";
import fs from "fs";
import { findApp } from "../../Commons/dynamodb";
import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  StandardRoles,
} from "../../Commons/Isengard";

async function main() {
  const stage = "prod";
  const role = StandardRoles.FullReadOnly;

  const regions: Region[] = ["MXP", "BAH", "HKG"];
  const accounts: AmplifyAccount[] = [];
  for (const region of regions) {
    const acct = await controlPlaneAccount(stage, region);
    accounts.push(acct);
  }
  await preflightCAZ({ accounts, role });

  for (const account of accounts) {
    const ddb = DynamoDBDocumentClient.from(
      new DynamoDB({
        region: account.region,
        credentials: getIsengardCredentialsProvider(account.accountId, role),
      })
    );

    const customerAppsFile = fs
      .readFileSync(`${toRegionName(account.region)}.csv`)
      .toString();
    let customerApps: string[][] = parse(customerAppsFile);
    customerApps.slice(1);

    for (const customerAccount of customerApps) {
      const appId = customerAccount[1];
      const app = await findApp(ddb, stage, account.region, appId, [
        "accountClosureStatus",
      ]);
      console.log(`${appId}, ${app?.accountClosureStatus}`);
      if (app?.accountClosureStatus !== "IsolateResources") {
      }
    }
  }
}

main().catch(console.error);
