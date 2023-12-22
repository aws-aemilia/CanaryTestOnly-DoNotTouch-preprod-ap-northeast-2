import createClient from "@amzn/aws-account-event-service-client";
import { AppDO } from "Commons/dynamodb";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  StandardRoles,
} from "Commons/Isengard";
import fs from "fs";

async function main() {
  const stage = "prod";
  const role = StandardRoles.FullReadOnly;
  // const dailyJournal = await DailyJournal.build();
  // const events = await dailyJournal.getEvents(new Date(2020, 10, 10), new Date(2020, 10, 12), "MXP");

  const dailyJournalAccounts = fs
    .readFileSync("AccountList.txt", "utf8")
    .split(",");

  const regions: Region[] = ["MXP", "BAH", "HKG"];
  const accounts: AmplifyAccount[] = [];
  for (const region of regions) {
    const acct = await controlPlaneAccount(stage, region);
    accounts.push(acct);
  }
  await preflightCAZ({ accounts, role });

  for (const account of accounts) {
    const isengardCredentialsProvider = getIsengardCredentialsProvider(
      account.accountId,
      role
    );

    const appDao = new AppDAO(
      stage,
      account.region,
      isengardCredentialsProvider
    );

    const terminatedOrRestoredAccountsWithApps: string[] = [];
    for await (const page of appDao.paginate(["accountId"])) {
      const apps = page.Items as AppDO[];
      const accountsWithApps = apps.map((item) => item.accountId);
      console.log(accountsWithApps);
      const accountsWithAppsDeduped = [...new Set(accountsWithApps)];
      console.log(accountsWithAppsDeduped);
      for (const account of accountsWithAppsDeduped) {
        console.log(account);
        if (dailyJournalAccounts.includes(account)) {
          console.log("found");
          terminatedOrRestoredAccountsWithApps.push(account);
        }
      }
    }
    console.log(terminatedOrRestoredAccountsWithApps);
    createClient("base.prod.us-east-1", {
      credentials: await isengardCredentialsProvider(),
    });
    for (const account of terminatedOrRestoredAccountsWithApps) {
    }
    fs.writeFileSync(
      `${account.region}.csv`,
      terminatedOrRestoredAccountsWithApps.join("\n")
    );
  }
}

main().catch(console.error);
