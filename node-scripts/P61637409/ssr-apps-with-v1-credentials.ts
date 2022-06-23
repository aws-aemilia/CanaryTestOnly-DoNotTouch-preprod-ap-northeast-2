import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import {
  exhaustiveScan,
  getAccount,
  getApp,
  getCredentials,
  getDdbClient,
  getDomainApp,
} from "./helpers";
import { App, Branch, LambdaEdgeConfig } from "./types";
import fs from "fs";
import { Credentials } from "../types";
import path from "path";

/**
 * This script was used to pre-emptively identify SSR apps and accounts that
 * could be impacted in Wave 4 and Wave 5 regions if the migration script were
 * to be executed.
 */
const regions = [
  "ap-east-1",
  "ap-northeast-2",
  "eu-north-1",
  "eu-west-3",
  "sa-east-1",
  "us-west-2",
  "ap-south-1",
  "ap-southeast-2",
  "eu-central-1",
  "eu-south-1",
  "eu-west-2",
  "me-south-1",
  "us-west-1",
];

const run = async () => {
  for (const region of regions) {
    const account = getAccount(region, "prod");

    const { accountId } = account;

    const credentials = await getCredentials(accountId, "prod", "ReadOnly");
    const ddbClient = getDdbClient(region, credentials);

    const apps = await getSSRAppsWithV1Creds(region, ddbClient);
    const branchApps = await getSSRAppsWithBranchV1Creds(region, ddbClient);
    const lambdaEdgeConfigApps = await getSSRAppsWithLambdaEdgeConfigV1Creds(
      region,
      ddbClient,
      credentials
    );

    const allApps = [
      ...new Set([...apps, ...branchApps, ...lambdaEdgeConfigApps]),
    ];

    fs.writeFileSync(
      path.join(__dirname, `/output/ssr-apps-with-v1-credentials/${region}`),
      allApps.map((app) => `${app.accountId},${app.appId}`).join("\n")
    );
  }
};

const getSSRAppsWithV1Creds = async (
  region: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const TableName = `prod-${region}-App`;
  let FilterExpression =
    "platform = :ssr and (" +
    "(attribute_exists(basicAuthCreds) and attribute_not_exists(basicAuthCredsV2)) OR " +
    "(attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCreds) and " +
    "attribute_not_exists(autoBranchCreationConfig.branchConfig.basicAuthCredsV2)))";

  const ExpressionAttributeValues = {
    ":ssr": "WEB_DYNAMIC",
  };

  const scan = new ScanCommand({
    TableName,
    ProjectionExpression: "appId,accountId",
    FilterExpression,
    ExpressionAttributeValues,
  });

  const items = await exhaustiveScan("App", scan, ddbClient);

  if (items.length < 1) {
    return [];
  }

  return items as App[];
};

const getSSRAppsWithBranchV1Creds = async (
  region: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const TableName = `prod-${region}-Branch`;
  let FilterExpression =
    "attribute_exists(config.basicAuthCreds) and " +
    "attribute_not_exists(config.basicAuthCredsV2)";

  const scan = new ScanCommand({
    TableName,
    ProjectionExpression: "appId",
    FilterExpression,
  });

  const items = await exhaustiveScan("Branch", scan, ddbClient);

  if (items.length < 1) {
    return [];
  }

  const apps = [];
  const branches = items as Branch[];

  for (const branch of branches) {
    const appId = branch.appId;

    const app = await getApp("prod", region, appId, ddbClient);

    if (app && app.platform === "WEB_DYNAMIC") {
      apps.push(app);
    }
  }

  return apps;
};

const getSSRAppsWithLambdaEdgeConfigV1Creds = async (
  region: string,
  ddbClient: DynamoDBDocumentClient,
  credentials: Credentials
) => {
  const TableName = `LambdaEdgeConfig`;
  let FilterExpression =
    "(attribute_exists(config.basicAuthCreds) and attribute_not_exists(config.basicAuthCredsV2)) OR " +
    "attribute_exists(branchConfig)";

  const scan = new ScanCommand({
    TableName,
    ProjectionExpression: "appId,branchConfig",
    FilterExpression,
  });

  const specialRegion = [
    "ap-east-1",
    "eu-north-1",
    "eu-south-1",
    "me-south-1",
  ].includes(region);

  const items = await exhaustiveScan(
    "LambdaEdgeConfig",
    scan,
    specialRegion ? getDdbClient("us-east-1", credentials) : ddbClient
  );

  if (items.length < 1) {
    return [];
  }

  const apps = [];
  const lambdaEdgeConfigs = items as LambdaEdgeConfig[];

  for (const lambdaEdgeConfig of lambdaEdgeConfigs) {
    const appId = lambdaEdgeConfig.appId;

    if (
      (lambdaEdgeConfig.config && lambdaEdgeConfig.config.basicAuthCreds) ||
      filterLambdaEdgeConfigBranches(lambdaEdgeConfig.branchConfig)
    ) {
      const app = await getApp("prod", region, appId, ddbClient);

      if (app && app.platform === "WEB_DYNAMIC") {
        apps.push(app);
        continue;
      }

      if (!app) {
        const domainId = appId;
        const domainApp = await getDomainApp(
          "prod",
          region,
          domainId,
          ddbClient
        );

        if (domainApp && domainApp.platform === "WEB_DYNAMIC") {
          apps.push(domainApp);
          continue;
        }
      }
    }

    if (lambdaEdgeConfig.branchConfig) {
    }
  }

  return apps;
};

const filterLambdaEdgeConfigBranches = (
  branchConfig: LambdaEdgeConfig["branchConfig"]
) => {
  if (branchConfig) {
    const branchNames = Object.keys(branchConfig);
    for (const branchName of branchNames) {
      if (branchConfig[branchName].basicAuthCreds) {
        return true;
      }
    }
  }
  return false;
};

run().catch((e) => console.error(e));
