import fs from "fs";
import path from "path";
import {
  getAccount,
  getApp,
  getCredentials,
  getDdbClient,
  getDomainApp,
} from "./helpers";
import { App, Branch, LambdaEdgeConfig } from "./types";

/**
 * This script was used to gather customer impact for customers who have
 * SSR apps with v1 basic authentication enabled and were impacted due to the
 * migration to v2 basic authentication
 */
const regions = [
  "ap-east-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ca-central-1",
  "eu-north-1",
  "eu-west-1",
  "eu-west-3",
  "sa-east-1",
  "us-east-2",
  "us-west-2",
  "ap-northeast-1",
  "ap-south-1",
  "ap-southeast-2",
  "eu-central-1",
  "eu-south-1",
  "eu-west-2",
  "me-south-1",
  "us-east-1",
  "us-west-1",
];

/**
 * Collecting customer impact using the regional JSON files that
 * were generated at the time of migration
 */
const migrations = ["migrated-2022-06-21", "migrated-2022-05-09"];

const run = async () => {
  for (const region of regions) {
    const appIds = getAppIds(region);

    console.log(region, appIds.length);

    const account = getAccount(region, "prod");

    const { accountId } = account;

    const credentials = await getCredentials(accountId, "prod", "ReadOnly");
    const ddbClient = getDdbClient(region, credentials);

    const accountIds = [];

    for (const appId of appIds) {
      const app = await getApp("prod", region, appId, ddbClient);

      if (app) {
        console.log(`Found app for App ID: ${app.appId}`);

        if (app.platform && app.platform === "WEB_DYNAMIC") {
          accountIds.push(app.accountId);
        }
        continue;
      }

      const domainId = appId;
      const domainApp = await getDomainApp("prod", region, domainId, ddbClient);

      if (domainApp) {
        console.log(`Found domain for App ID: ${appId}`);

        if (domainApp.platform && domainApp.platform === "WEB_DYNAMIC") {
          accountIds.push(domainApp.accountId);
        }
        continue;
      }

      console.log(`Found nothing. Deleted app: ${appId}`);
    }

    fs.writeFileSync(
      path.join(__dirname, `./output/customer-impact/${region}`),
      [...new Set(accountIds)].join("\n")
    );
  }
};

const getAppIds = (region: string) => {
  const appIds = [];

  for (const migration of migrations) {
    try {
      const prefixPath = `./output/prod/${migration}/${region}`;

      const LambaEdgeConfigs: LambdaEdgeConfig[] = JSON.parse(
        fs
          .readFileSync(
            path.join(__dirname, `${prefixPath}/LambdaEdgeConfig.json`)
          )
          .toString()
      );
      const apps: App[] = JSON.parse(
        fs
          .readFileSync(
            path.join(__dirname, `${prefixPath}/prod-${region}-App.json`)
          )
          .toString()
      );
      const branches: Branch[] = JSON.parse(
        fs
          .readFileSync(
            path.join(__dirname, `${prefixPath}/prod-${region}-Branch.json`)
          )
          .toString()
      );

      appIds.push(
        ...new Set([
          ...LambaEdgeConfigs.filter(filterLambdaEdgeConfigs).map(
            (lambdaEdgeConfig) => lambdaEdgeConfig.appId
          ),
          ...apps.filter(filterApps).map((a) => a.appId),
          ...branches.filter(filterBranches).map((b) => b.appId),
        ])
      );
    } catch (e) {
      console.error(e);
      continue;
    }
  }

  return appIds;
};

const filterLambdaEdgeConfigs = (lambdaEdgeConfig: LambdaEdgeConfig) => {
  if (
    lambdaEdgeConfig.config &&
    lambdaEdgeConfig.config.basicAuthCreds &&
    !lambdaEdgeConfig.config.basicAuthCredsV2
  ) {
    return true;
  }

  if (lambdaEdgeConfig.branchConfig) {
    const branchNames = Object.keys(lambdaEdgeConfig.branchConfig);
    for (const branchName of branchNames) {
      if (
        lambdaEdgeConfig.branchConfig[branchName].basicAuthCreds &&
        !lambdaEdgeConfig.branchConfig[branchName].basicAuthCredsV2
      ) {
        return true;
      }
    }
  }

  return false;
};

const filterApps = (app: App) => {
  if (app.basicAuthCreds && !app.basicAuthCredsV2) {
    return true;
  }

  if (
    app.autoBranchCreationConfig &&
    app.autoBranchCreationConfig.branchConfig &&
    app.autoBranchCreationConfig.branchConfig.basicAuthCreds &&
    !app.autoBranchCreationConfig.branchConfig.basicAuthCredsV2
  ) {
    return true;
  }

  return false;
};

const filterBranches = (branch: Branch) => {
  if (
    branch.config &&
    branch.config.basicAuthCreds &&
    !branch.config.basicAuthCredsV2
  ) {
    return true;
  }

  return false;
};

run().catch((e) => console.error(e));
