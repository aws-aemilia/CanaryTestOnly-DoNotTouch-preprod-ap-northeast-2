import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { getAttributeName, getCredentialsHash } from "../helpers";
import { Branch, BranchConfig } from "../types";

export const migrateBranchTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `${stage}-${region}-Branch`;
  const branches = givenAppId
    ? await getBranchesForAppIdWithCreds(tableName, givenAppId, ddbClient)
    : await getBranchesWithCreds(tableName, ddbClient);

  console.log(
    JSON.stringify({
      message: `Found ${branches.length} branches to migrate`,
    })
  );

  const modifiedBranches: Branch[] = [];

  for (const branch of branches) {
    const appId = branch.appId;
    const branchName = branch.branchName;
    const config = branch.config;

    if (!appId || !branchName) {
      continue;
    }

    const pristineBranch = JSON.parse(JSON.stringify(branch));
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
              await updateBranch(
                basicAuthCredsV2,
                "config.basicAuthCredsV2",
                appId,
                branchName,
                tableName,
                ddbClient
              );
              console.log(
                JSON.stringify({
                  appId,
                  branchName,
                  message: `Branch.config has been migrated to v2 credentials`,
                })
              );
              modifiedBranches.push(pristineBranch);
              modified = true;
            }
          }

          if (basicAuthCredsV2) {
            await deleteFromBranch(
              "config.basicAuthCreds",
              appId,
              branchName,
              tableName,
              ddbClient
            );
            console.log(
              JSON.stringify({
                appId,
                branchName,
                message: `v1 credentials removed for Branch.config`,
              })
            );
            if (!modified) {
              modifiedBranches.push(pristineBranch);
            }
          }
        }
      }
    } catch (err) {
      console.error(
        `Error updating branch ${branchName} for App ID ${appId}`,
        err
      );
    }
  }

  mkdirSync(`P61637409/output/${stage}/${region}`, {
    recursive: true,
  });
  writeFileSync(
    `P61637409/output/${stage}/${region}/${tableName}.json`,
    JSON.stringify(modifiedBranches),
    "utf8"
  );
};

export const rollbackBranchTable = async (
  ddbClient: DynamoDBDocumentClient,
  region: string,
  stage: string,
  givenAppId?: string
) => {
  const tableName = `${stage}-${region}-Branch`;
  let branches: Branch[];

  try {
    branches = JSON.parse(
      readFileSync(
        `P61637409/output/${stage}/${region}/${tableName}.json`,
        "utf8"
      ).toString()
    );
  } catch (err) {
    console.error(`Error reading Branch data from JSON`, err);
    throw err;
  }

  for (const branch of branches) {
    const appId = branch.appId;
    const branchName = branch.branchName;
    const config = branch.config;

    if (!appId || !branchName || !config) {
      continue;
    }

    if (givenAppId && appId !== givenAppId) {
      continue;
    }

    try {
      const basicAuthCreds = config.basicAuthCreds;
      const basicAuthCredsV2 = config.basicAuthCredsV2;

      if (basicAuthCreds) {
        await updateBranch(
          basicAuthCreds,
          "config.basicAuthCreds",
          appId,
          branchName,
          tableName,
          ddbClient
        );
        console.log(
          JSON.stringify({
            appId,
            branchName,
            message: `Branch.config has been rolled back to v1 credentials`,
          })
        );
      }

      if (!basicAuthCredsV2) {
        await deleteFromBranch(
          "config.basicAuthCredsV2",
          appId,
          branchName,
          tableName,
          ddbClient
        );
        console.log(
          JSON.stringify({
            appId,
            branchName,
            message: `v2 credentials removed from Branch.config`,
          })
        );
      }
    } catch (err) {
      console.error(
        `Error rolling back branch ${branchName} for App ID ${appId}`,
        err
      );
    }
  }
};

const getBranchesWithCreds = async (
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const scan = new ScanCommand({
    TableName: tableName,
    ProjectionExpression: "appId,config,branchName",
    FilterExpression:
      "attribute_exists(config.basicAuthCreds) OR attribute_exists(config.basicAuthCredsV2)",
  });

  const res = await ddbClient.send(scan);

  if (!res || !res.Items || res.Items.length < 1) {
    return [];
  }

  return res.Items as Branch[];
};

const getBranchesForAppIdWithCreds = async (
  tableName: string,
  appId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const query = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: "appId = :appId",
    ExpressionAttributeValues: {
      ":appId": appId,
    },
    ProjectionExpression: "appId,config,branchName",
  });

  const res = await ddbClient.send(query);

  if (!res || !res.Items || res.Items.length < 1) {
    return [];
  }

  return [res.Items[0]] as Branch[];
};

const updateBranch = async (
  value: string | BranchConfig,
  attribute: string,
  appId: string,
  branchName: string,
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const { attributeName, ExpressionAttributeNames } =
    getAttributeName(attribute);

  const update = new UpdateCommand({
    TableName: tableName,
    Key: {
      appId,
      branchName,
    },
    UpdateExpression: `set ${attributeName} = :value`,
    ExpressionAttributeNames,
    ExpressionAttributeValues: {
      [":value"]: value,
    },
  });

  await ddbClient.send(update);
};

const deleteFromBranch = async (
  attribute: string,
  appId: string,
  branchName: string,
  tableName: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const { attributeName, ExpressionAttributeNames } =
    getAttributeName(attribute);

  const update = new UpdateCommand({
    TableName: tableName,
    Key: {
      appId,
      branchName,
    },
    UpdateExpression: `remove ${attributeName}`,
    ExpressionAttributeNames,
  });

  await ddbClient.send(update);
};
