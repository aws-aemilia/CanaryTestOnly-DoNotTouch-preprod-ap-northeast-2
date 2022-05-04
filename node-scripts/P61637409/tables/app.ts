import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { getAttributeName, getCredentialsHash } from "../helpers";
import { App, AutoBranchCreationConfig } from "../types";

export const migrateAppTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `${stage}-${region}-App`;
  const apps = givenAppId
    ? await getAppWithCreds(tableName, givenAppId, ddbClient)
    : await getAppsWithCreds(tableName, ddbClient);

  console.log(
    JSON.stringify({
      message: `Found ${apps.length} apps to migrate`,
    })
  );

  const modifiedApps: App[] = [];

  for (const app of apps) {
    const appId = app.appId;
    const basicAuthCreds = app.basicAuthCreds;
    let basicAuthCredsV2 = app.basicAuthCredsV2;

    if (!appId) {
      continue;
    }

    const pristineApp: App = JSON.parse(JSON.stringify(app));
    let modified = false;

    try {
      if (basicAuthCreds) {
        // Generate v2 credentials if it does not exist already
        if (!basicAuthCredsV2) {
          basicAuthCredsV2 = getCredentialsHash(basicAuthCreds);

          // This can be undefined if there was an issue with the v1 credentials
          if (basicAuthCredsV2) {
            await updateApp(
              basicAuthCredsV2,
              "basicAuthCredsV2",
              appId,
              tableName,
              ddbClient
            );
            console.log(
              JSON.stringify({
                appId,
                message: `App has been migrated to v2 credentials`,
              })
            );
            modifiedApps.push(pristineApp);
            modified = true;
          }
        }

        // delete v1 credentials from app only if v2 exists
        if (basicAuthCredsV2) {
          await deleteFromApp("basicAuthCreds", appId, tableName, ddbClient);
          console.log(
            JSON.stringify({
              appId,
              message: `v1 credentials have been removed for app`,
            })
          );
          if (!modified) {
            modifiedApps.push(pristineApp);
            modified = true;
          }
        }
      }

      const autoBranchCreationConfig =
        app.autoBranchCreationConfig as AutoBranchCreationConfig;

      if (!autoBranchCreationConfig || !autoBranchCreationConfig.branchConfig) {
        continue;
      }

      const autoBranchCreds =
        autoBranchCreationConfig.branchConfig.basicAuthCreds;
      let autoBranchCredsV2 =
        autoBranchCreationConfig.branchConfig.basicAuthCredsV2;

      if (autoBranchCreds) {
        // Generate v2 credentials if it does not exist already
        if (!autoBranchCredsV2) {
          autoBranchCredsV2 = getCredentialsHash(autoBranchCreds);

          // This can be undefined if there was an issue with the v1 credentials
          if (autoBranchCredsV2) {
            await updateApp(
              autoBranchCredsV2,
              "autoBranchCreationConfig.branchConfig.basicAuthCredsV2",
              appId,
              tableName,
              ddbClient
            );

            console.log(
              JSON.stringify({
                appId,
                message: `App.autoBranchCreationConfig has been migrated to v2 credentials`,
              })
            );
            if (!modified) {
              modifiedApps.push(pristineApp);
              modified = true;
            }
          }
        }

        if (autoBranchCredsV2) {
          await deleteFromApp(
            "autoBranchCreationConfig.branchConfig.basicAuthCreds",
            appId,
            tableName,
            ddbClient
          );
          console.log(
            JSON.stringify({
              appId,
              message: `v1 credentials removed for App.autoBranchCreationConfig`,
            })
          );
          if (!modified) {
            modifiedApps.push(pristineApp);
          }
        }
      }
    } catch (err) {
      console.error(`Error updating app with App ID: ${appId}`, err);
    }
  }

  mkdirSync(`P61637409/output/${stage}/${region}`, {
    recursive: true,
  });
  writeFileSync(
    `P61637409/output/${stage}/${region}/${tableName}.json`,
    JSON.stringify(modifiedApps),
    "utf8"
  );
};

export const rollbackAppTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `${stage}-${region}-App`;
  let apps: App[];

  try {
    apps = JSON.parse(
      readFileSync(
        `P61637409/output/${stage}/${region}/${tableName}.json`,
        "utf8"
      ).toString()
    );
  } catch (err) {
    console.error(`Error reading App data from JSON`, err);
    throw err;
  }

  for (const app of apps) {
    const appId = app.appId;

    if (!appId) {
      continue;
    }

    if (givenAppId && appId !== givenAppId) {
      continue;
    }

    const basicAuthCreds = app.basicAuthCreds;
    const basicAuthCredsV2 = app.basicAuthCredsV2;

    try {
      if (basicAuthCreds) {
        await updateApp(
          basicAuthCreds,
          "basicAuthCreds",
          appId,
          tableName,
          ddbClient
        );
        console.log(
          JSON.stringify({
            appId,
            message: `App has been rolled back to v1 credentials`,
          })
        );
      }

      if (!basicAuthCredsV2) {
        await deleteFromApp("basicAuthCredsV2", appId, tableName, ddbClient);
        console.log(
          JSON.stringify({
            appId,
            message: `v2 credentials have been removed for app`,
          })
        );
      }

      const autoBranchCreationConfig =
        app.autoBranchCreationConfig as AutoBranchCreationConfig;

      if (autoBranchCreationConfig && autoBranchCreationConfig.branchConfig) {
        const autoBranchCreds =
          autoBranchCreationConfig.branchConfig.basicAuthCreds;
        const autoBranchCredsV2 =
          autoBranchCreationConfig.branchConfig.basicAuthCredsV2;

        if (autoBranchCreds) {
          await updateApp(
            autoBranchCreds,
            "autoBranchCreationConfig.branchConfig.basicAuthCreds",
            appId,
            tableName,
            ddbClient
          );

          console.log(
            JSON.stringify({
              appId,
              message: `App.autoBranchCreationConfig has been rolled back to v1 credentials`,
            })
          );
        }

        if (!autoBranchCredsV2) {
          await deleteFromApp("autoBranchCredsV2", appId, tableName, ddbClient);

          console.log(
            JSON.stringify({
              appId,
              message: `v2 credentials removed from App.autoBranchCreationConfig`,
            })
          );
        }
      }
    } catch (err) {
      console.error(`Error rolling back app with App ID: ${appId}`, err);
    }
  }
};

const getAppsWithCreds = async (
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const scan = new ScanCommand({
    TableName: tableName,
    ProjectionExpression:
      "appId,basicAuthCreds,basicAuthCredsV2,autoBranchCreationConfig",
    FilterExpression:
      "attribute_exists(basicAuthCreds) OR attribute_exists(basicAuthCredsV2) OR " +
      "attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCreds) OR " +
      "attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCredsV2)",
  });

  const res = await ddbClient.send(scan);

  if (!res || !res.Items || res.Items.length < 1) {
    return [];
  }

  return res.Items as App[];
};

const getAppWithCreds = async (
  tableName: string,
  appId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const get = new GetCommand({
    TableName: tableName,
    Key: {
      appId,
    },
    ProjectionExpression:
      "appId,basicAuthCreds,basicAuthCredsV2,autoBranchCreationConfig",
  });

  const res = await ddbClient.send(get);

  if (!res || !res.Item) {
    return [];
  }

  return [res.Item] as App[];
};

const updateApp = async (
  value: string | AutoBranchCreationConfig,
  attribute: string,
  appId: string,
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const { attributeName, ExpressionAttributeNames } =
    getAttributeName(attribute);

  const update = new UpdateCommand({
    TableName: tableName,
    Key: {
      appId,
    },
    UpdateExpression: `set ${attributeName} = :value`,
    ExpressionAttributeNames,
    ExpressionAttributeValues: {
      [":value"]: value,
    },
  });

  await ddbClient.send(update);
};

const deleteFromApp = async (
  attribute: string,
  appId: string,
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const { attributeName, ExpressionAttributeNames } =
    getAttributeName(attribute);

  const update = new UpdateCommand({
    TableName: tableName,
    Key: {
      appId,
    },
    UpdateExpression: `remove ${attributeName}`,
    ExpressionAttributeNames,
  });

  await ddbClient.send(update);
};
