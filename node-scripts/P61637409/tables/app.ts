import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  getAttributeName,
  getCredentialsHash,
  exhaustiveScan,
} from "../helpers";
import { App, AutoBranchCreationConfig } from "../types";

export const migrateAppTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string,
  skipSSR = true
) => {
  const tableName = `${stage}-${region}-App`;
  const apps = givenAppId
    ? await getAppWithCreds(tableName, givenAppId, ddbClient)
    : await getAppsWithCreds(tableName, ddbClient, skipSSR);

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

    console.log(
      JSON.stringify({
        message: `Processing App`,
        appId,
      })
    );

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

      const autoBranchCreationConfig = app.autoBranchCreationConfig as AutoBranchCreationConfig;

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
      console.error(
        JSON.stringify({
          message: "Error updating app",
          appId,
          err,
        })
      );
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
    console.error(
      JSON.stringify({
        message: `Error reading App data from JSON`,
        err,
      })
    );
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

      const autoBranchCreationConfig = app.autoBranchCreationConfig as AutoBranchCreationConfig;

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
      console.error(
        JSON.stringify({
          message: "Error rolling back app",
          appId,
          err,
        })
      );
    }
  }
};

const getAppsWithCreds = async (
  tableName: string,
  ddbClient: DynamoDBDocumentClient,
  skipSSR = true
) => {
  let FilterExpression =
    "attribute_exists(basicAuthCreds) OR attribute_exists(basicAuthCredsV2) OR " +
    "attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCreds) OR " +
    "attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCredsV2)";

  if (skipSSR) {
    FilterExpression = `platform <> :ssr and (${FilterExpression})`;
  }

  const ExpressionAttributeValues = skipSSR
    ? {
        ":ssr": "WEB_DYNAMIC",
      }
    : undefined;

  const scan = new ScanCommand({
    TableName: tableName,
    ProjectionExpression:
      "appId,basicAuthCreds,basicAuthCredsV2,autoBranchCreationConfig",
    FilterExpression,
    ExpressionAttributeValues,
  });

  /**
   * Would be nice to use paginateScan from `@aws-sdk/client-dynamodb`, but there's
   * no way to control the load on table capacity. With the custom `exhautiveScan`
   * method, we're able to do the scan in intervals of 1 second, preventing a spike
   * in the read usage.
   */
  const items = await exhaustiveScan("App", scan, ddbClient);

  if (items.length < 1) {
    return [];
  }

  return items as App[];
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
  const { attributeName, ExpressionAttributeNames } = getAttributeName(
    attribute
  );

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

  // 100ms interval between each update to prevent overloading the DDB table capacity
  await new Promise((resolve) => setTimeout(resolve, 100));
};

const deleteFromApp = async (
  attribute: string,
  appId: string,
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const { attributeName, ExpressionAttributeNames } = getAttributeName(
    attribute
  );

  const update = new UpdateCommand({
    TableName: tableName,
    Key: {
      appId,
    },
    UpdateExpression: `remove ${attributeName}`,
    ExpressionAttributeNames,
  });

  await ddbClient.send(update);

  // 100ms interval between each update to prevent overloading the DDB table capacity
  await new Promise((resolve) => setTimeout(resolve, 100));
};
