import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { LambdaEdgeConfig } from "../types";

const TABLE_NAME = `LambdaEdgeConfig`;

/**
 * Looks up the `LambaEdgeConfig` for the given appId/domainId
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param domainOrAppId The domainId/appId
 * @returns
 */
export const getLambdaEdgeConfigForAppOrDomain = async (
  dynamodb: DynamoDBDocumentClient,
  domainOrAppId: string
) => {
  if (!domainOrAppId) {
    console.log("Invalid app or domain");
    return;
  }

  try {
    console.log(
      "Looking up Lambda@Edge config for given domainOrAppId",
      domainOrAppId
    );
    const lambdaEdgeConfigItem = await dynamodb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "appId = :appId",
        ExpressionAttributeValues: {
          ":appId": domainOrAppId,
        },
        ProjectionExpression: "appId,customDomainIds",
      })
    );

    if (!lambdaEdgeConfigItem.Items || lambdaEdgeConfigItem.Items.length < 1) {
      return;
    }

    return lambdaEdgeConfigItem.Items[0] as Partial<LambdaEdgeConfig>;
  } catch (err) {
    console.error("LambdaEdgeConfig not found", err);
    return;
  }
};

export const removeDomainFromLambdaEdgeConfig = async (
  appId: string,
  domainId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const domainIdToRemove = new Set();
  domainIdToRemove.add(domainId);

  const update = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: {
      appId,
    },
    UpdateExpression: "DELETE customDomainIds :domainId",
    ExpressionAttributeValues: {
      ":domainId": domainIdToRemove,
    },
  });

  await ddbClient.send(update);
};
