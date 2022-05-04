import {
  DynamoDBDocumentClient,
  GetCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getAttributeName, getCredentialsHash } from "../helpers";
import { LambdaEdgeConfig } from "../types";
import { mkdirSync, readFileSync, writeFileSync } from "fs";

export const migrateLambdaEdgeConfigTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `LambdaEdgeConfig`;
  const lambdaEdgeConfigs = givenAppId
    ? await getLambdaEdgeConfigWithCreds(tableName, givenAppId, ddbClient)
    : await getLambdaEdgeConfigsWithCreds(tableName, ddbClient);

  console.log(
    JSON.stringify({
      message: `Found ${lambdaEdgeConfigs.length} LambdaEdgeConfigs to migrate`,
    })
  );

  const modifiedLambdaEdgeConfigs: LambdaEdgeConfig[] = [];

  for (const lambdaEdgeConfig of lambdaEdgeConfigs) {
    const appId = lambdaEdgeConfig.appId;
    const config = lambdaEdgeConfig.config;

    if (!appId) {
      continue;
    }

    const pristineLambdaEdgeConfig: LambdaEdgeConfig = JSON.parse(
      JSON.stringify(lambdaEdgeConfig)
    );
    let modified = false;

    try {
      if (config) {
        const basicAuthCreds = config.basicAuthCreds;
        let basicAuthCredsV2 = config.basicAuthCredsV2;

        if (basicAuthCreds) {
          // Generate v2 credentials if it does not exist already
          if (!basicAuthCredsV2) {
            basicAuthCredsV2 = getCredentialsHash(basicAuthCreds);

            // This can be undefined if there was an issue with the v1 credentials
            if (basicAuthCredsV2) {
              await updateLambdaEdgeConfig(
                basicAuthCredsV2,
                "config.basicAuthCredsV2",
                appId,
                tableName,
                ddbClient
              );
              console.log(
                JSON.stringify({
                  appId,
                  message: `LambdaEdgeConfig.config has been migrated to v2 credentials`,
                })
              );
              modifiedLambdaEdgeConfigs.push(pristineLambdaEdgeConfig);
              modified = true;
            }
          }

          if (basicAuthCredsV2) {
            await deleteFromLambdaEdgeConfig(
              "config.basicAuthCreds",
              appId,
              tableName,
              ddbClient
            );
            console.log(
              JSON.stringify({
                appId,
                message: `v1 credentials have been removed for LambdaEdgeConfig.config`,
              })
            );
            if (!modified) {
              modifiedLambdaEdgeConfigs.push(pristineLambdaEdgeConfig);
              modified = true;
            }
          }
        }
      }

      const branchConfig = lambdaEdgeConfig.branchConfig;

      if (!branchConfig) {
        continue;
      }

      for (const branchName of Object.keys(branchConfig)) {
        const basicAuthCreds = branchConfig[branchName].basicAuthCreds;
        let basicAuthCredsV2 = branchConfig[branchName].basicAuthCredsV2;

        if (basicAuthCreds) {
          // Generate v2 credentials if it does not exist already
          if (!basicAuthCredsV2) {
            basicAuthCredsV2 = getCredentialsHash(basicAuthCreds);

            // This can be undefined if there was an issue with the v1 credentials
            if (basicAuthCredsV2) {
              await updateLambdaEdgeConfig(
                basicAuthCredsV2,
                `branchConfig.${branchName}.basicAuthCredsV2`,
                appId,
                tableName,
                ddbClient
              );

              console.log(
                JSON.stringify({
                  appId,
                  branchName,
                  message: `LambdaEdgeConfig.branchConfig has been migrated to v2 credentials`,
                })
              );
              if (!modified) {
                modifiedLambdaEdgeConfigs.push(pristineLambdaEdgeConfig);
                modified = true;
              }
            }
          }

          if (basicAuthCredsV2) {
            await deleteFromLambdaEdgeConfig(
              `branchConfig.${branchName}.basicAuthCreds`,
              appId,
              tableName,
              ddbClient
            );

            console.log(
              JSON.stringify({
                appId,
                branchName,
                message: `v1 credentials have been removed for LambdaEdgeConfig.branchConfig`,
              })
            );
            if (!modified) {
              modifiedLambdaEdgeConfigs.push(pristineLambdaEdgeConfig);
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `Error updating LambdaEdgeConfig for App Id: ${appId}`,
        err
      );
    }
  }

  mkdirSync(`P61637409/output/${stage}/${region}`, {
    recursive: true,
  });
  writeFileSync(
    `P61637409/output/${stage}/${region}/${tableName}.json`,
    JSON.stringify(modifiedLambdaEdgeConfigs),
    "utf8"
  );
};

export const rollbackLambdaEdgeConfigTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `LambdaEdgeConfig`;
  let lambdaEdgeConfigs: LambdaEdgeConfig[];

  try {
    lambdaEdgeConfigs = JSON.parse(
      readFileSync(
        `P61637409/output/${stage}/${region}/${tableName}.json`,
        "utf8"
      ).toString()
    );
  } catch (err) {
    console.error(`Error reading LambdaEdgeConfig data from JSON`, err);
    throw err;
  }

  for (const lambdaEdgeConfig of lambdaEdgeConfigs) {
    const appId = lambdaEdgeConfig.appId;
    const config = lambdaEdgeConfig.config;

    if (!appId) {
      continue;
    }

    if (givenAppId && appId !== givenAppId) {
      continue;
    }

    try {
      if (config) {
        const basicAuthCreds = config.basicAuthCreds;
        const basicAuthCredsV2 = config.basicAuthCredsV2;

        if (basicAuthCreds) {
          await updateLambdaEdgeConfig(
            basicAuthCreds,
            "config.basicAuthCreds",
            appId,
            tableName,
            ddbClient
          );
          console.log(
            JSON.stringify({
              appId,
              message: `LambdaEdgeConfig.config has been rolled back to v1`,
            })
          );
        }

        if (!basicAuthCredsV2) {
          await deleteFromLambdaEdgeConfig(
            "config.basicAuthCredsV2",
            appId,
            tableName,
            ddbClient
          );
          console.log(
            JSON.stringify({
              appId,
              message: `v2 credentials removed from LambdaEdgeConfig.config`,
            })
          );
        }
      }

      const branchConfig = lambdaEdgeConfig.branchConfig;

      if (!branchConfig) {
        continue;
      }

      for (const branchName of Object.keys(branchConfig)) {
        const basicAuthCreds = branchConfig[branchName].basicAuthCreds;
        const basicAuthCredsV2 = branchConfig[branchName].basicAuthCredsV2;

        if (basicAuthCreds) {
          await updateLambdaEdgeConfig(
            basicAuthCreds,
            `branchConfig.${branchName}.basicAuthCreds`,
            appId,
            tableName,
            ddbClient
          );

          console.log(
            JSON.stringify({
              appId,
              message: `LambdaEdgeConfig.branchConfig has been rolled back to v1`,
            })
          );
        }

        if (!basicAuthCredsV2) {
          await deleteFromLambdaEdgeConfig(
            `branchConfig.${branchName}.basicAuthCredsV2`,
            appId,
            tableName,
            ddbClient
          );

          console.log(
            JSON.stringify({
              appId,
              message: `v2 credentials removed from LambdaEdgeConfig.branchConfig`,
            })
          );
        }
      }
    } catch (err) {
      console.error(
        `Error rolling back LambdaEdgeConfig for App Id: ${appId}`,
        err
      );
    }
  }
};

const getLambdaEdgeConfigsWithCreds = async (
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const scan = new ScanCommand({
    TableName: tableName,
    ProjectionExpression: "appId,config,branchConfig",
    FilterExpression:
      "attribute_exists(config.basicAuthCreds) OR attribute_exists(config.basicAuthCredsV2) OR " +
      "attribute_exists(branchConfig)",
  });

  const res = await ddbClient.send(scan);

  if (!res || !res.Items || res.Items.length < 1) {
    return [];
  }

  return res.Items as LambdaEdgeConfig[];
};

const getLambdaEdgeConfigWithCreds = async (
  tableName: string,
  appId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const get = new GetCommand({
    TableName: tableName,
    Key: {
      appId,
    },
    ProjectionExpression: "appId,config,branchConfig",
  });

  const res = await ddbClient.send(get);

  if (!res || !res.Item) {
    return [];
  }

  return [res.Item] as LambdaEdgeConfig[];
};

const updateLambdaEdgeConfig = async (
  value: string | LambdaEdgeConfig["config"],
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

const deleteFromLambdaEdgeConfig = async (
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
