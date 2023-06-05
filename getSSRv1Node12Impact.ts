import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  controlPlaneAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Stage,
} from "./commons/Isengard";
import { toRegionName, toAirportCode } from "./commons/utils/regions";
import sleep from "./commons/utils/sleep";
import fs from "fs";
import path from "path";
import { paginateApps } from "./commons/dynamodb/tables/app";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import pino from "pino";
import pinoPretty from "pino-pretty";

const logger = pino(pinoPretty());

type App = {
  appId: string;
  accountId: string;
  platform: string;
  nextJSLiveUpdates: string | undefined;
};

const STAGE: Stage = "prod";

const isAppImpacted = (app: App) => {
  const platformIsWebDynamic = app.platform === "WEB_DYNAMIC";

  if (
    platformIsWebDynamic &&
    app.nextJSLiveUpdates &&
    app.nextJSLiveUpdates === "latest"
  ) {
    return false;
  }

  // some customers are incorrectly using Semantic Versioning e.g. '2.0.0' which is why we use split()
  const versionNumber: number | undefined = app.nextJSLiveUpdates
    ? Number(app.nextJSLiveUpdates.split(".")[0].replace(/\W/g, ""))
    : undefined;

  const livePkgUpdatesNotSet = app.nextJSLiveUpdates === undefined;
  const livePkgUpdatesNotIncludeNextVersion =
    app.nextJSLiveUpdates === undefined;

  // some customers are incorrectly using numbers higher than '12' which is why we use the < 10 check
  const nextVersionNot10_11_12_live = versionNumber && versionNumber < 10;

  /*
    Impact Criteria: 

    Platform is WEB_DYNAMIC
    AND 
    (
        _LIVE_PACKAGE_UPDATES is not set
        OR _LIVE_PACKAGE_UPDATES does not include next-version
        OR _LIVE_PACKAGE_UPDATES includes next-version not in ["10", "11", "12"]
    )
    */
  return (
    platformIsWebDynamic &&
    (livePkgUpdatesNotSet ||
      livePkgUpdatesNotIncludeNextVersion ||
      nextVersionNot10_11_12_live)
  );
};

const formatSetToString = (set: Set<string>): string => {
  let str = "";
  for (const key of set) {
    str += `${key}\n`;
  }
  return str;
};

const getNextVersion = (environmentVariables: {
  [name: string]: string;
}): string | undefined => {
  try {
    if (
      environmentVariables &&
      environmentVariables._LIVE_UPDATES &&
      environmentVariables._LIVE_UPDATES.includes("next-version")
    ) {
      const updates = JSON.parse(environmentVariables._LIVE_UPDATES);
      for (const entry of updates) {
        if (entry.pkg === "next-version") {
          return entry.version;
        }
      }
    }
  } catch (err) {
    logger.error("could not parse live updates");
    logger.error(environmentVariables._LIVE_UPDATES);
  }
  return undefined;
};

const main = async () => {
  const appsImpacted: App[] = [];
  const accountIdsImpacted = new Set<string>();
  const accounts = await controlPlaneAccounts({ stage: "prod" });
  for (const account of accounts) {
    logger.info(`Getting data for ${account.accountId} : ${account.region} `);
    const SLEEP_PERIOD_MS = 100;
    const airportCode = toAirportCode(account.region);
    const regionName = toRegionName(account.region);
    const controlPlaneAccount_ = await controlPlaneAccount(STAGE, airportCode);
    const role = STAGE === "prod" ? "FullReadOnly" : "ReadOnly";
    const ddb = DynamoDBDocumentClient.from(
      new DynamoDB({
        region: regionName,
        credentials: getIsengardCredentialsProvider(
          controlPlaneAccount_.accountId,
          role
        ),
      })
    );

    for await (const page of paginateApps(ddb, STAGE, account.region, [
      "appId",
      "accountId",
      "platform",
      "environmentVariables",
    ])) {
      for (const item of page.Items || []) {
        if (!item) continue;

        const app: App = {
          appId: item.appId,
          accountId: item.accountId,
          platform: item.platform,
          nextJSLiveUpdates: getNextVersion(item.environmentVariables),
        };

        // check if the app would be impacted
        if (isAppImpacted(app)) {
          appsImpacted.push(app);
          accountIdsImpacted.add(app.accountId);
          logger.info(
            `${appsImpacted.length} apps and ${accountIdsImpacted.size} customers impacted so far.`
          );
        }
      }

      // sleep before next ddb page call to avoid throttles
      await sleep(SLEEP_PERIOD_MS);
    }
  }

  logger.info(`--------------------------------`);
  logger.info(`${appsImpacted.length} Apps impacted.`);
  logger.info(`${accountIdsImpacted.size} Customers impacted.`);

  const accountIdsImpactFileName = `SSRV1_Node12_accountIds.txt`;
  logger.info(`writing output data to: ${accountIdsImpactFileName}`);
  fs.writeFileSync(
    path.join(__dirname, accountIdsImpactFileName),
    formatSetToString(accountIdsImpacted)
  );

  const appsImpactFileName = `SSRV1_Node12_apps.json`;
  logger.info(`writing output data to: ${appsImpactFileName}`);
  fs.writeFileSync(
    path.join(__dirname, appsImpactFileName),
    JSON.stringify(appsImpacted)
  );

  logger.info(`Done writing data`);
};

main()
  .then()
  .catch((e) => logger.error(e));
