import {
  DynamoDBDocumentClient,
  paginateScan,
  GetCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { LambdaEdgeConfig } from "../types";

const TABLE_NAME = `LambdaEdgeConfig`;

/**
 * Looks up the `LambaEdgeConfig` for the given appId/domainId
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param domainOrAppId The domainId/appId
 * @param attributesToGet e.g. ["appId", "branchConfig"]
 * @returns
 */
export const getLambdaEdgeConfigForAppOrDomain = async (
  dynamodb: DynamoDBDocumentClient,
  domainOrAppId: string,
  attributesToGet?: string[]
) => {
  if (!domainOrAppId) {
    console.log("Invalid app or domain");
    return;
  }

  try {
    const lambdaEdgeConfigItem = await dynamodb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: attributesToGet?.join(","),
        Key: {
          appId: domainOrAppId,
        },
      })
    );

    if (!lambdaEdgeConfigItem.Item) {
      return;
    }

    return lambdaEdgeConfigItem.Item as Partial<LambdaEdgeConfig>;
  } catch (err) {
    console.error("LambdaEdgeConfig not found", err);
    return;
  }
};

/**
 *
 * @param appId The appId to remove the domainId from
 * @param domainId The domainId to remove
 * @param ddbClient DocumentClient
 */
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

/**
 * Returns an iterator to paginate the LambdaEdgeConfig table. You can use the iterator
 * with `for await (const batch of paginateLambdaEdgeConfigs())`. Each batch will contain
 * a list of items. It uses lazy loading so it doesn't consume the next page
 * until the iterator reaches the end.
 *
 * @param documentClient DynamoDB document client
 * @param attributesToGet i.e. ["appId", "platform"]
 *
 * @returns Iterator of pages
 */
export const paginateLambdaEdgeConfigs = (
  documentClient: DynamoDBDocumentClient,
  attributesToGet: string[] = ["appId"]
) => {
  return paginateScan(
    {
      pageSize: 1000,
      client: documentClient,
    },
    {
      TableName: TABLE_NAME,
      ProjectionExpression: attributesToGet.join(","),
    }
  );
};
