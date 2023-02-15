import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  paginateScan
} from "@aws-sdk/lib-dynamodb";

/**
 * Looks up the customer account ID based on a given appId/domainId. It uses the
 * App and Domain tables in the Control Plane account. This query is safe to run
 * because it doesn't fetch customer data. Returns null if it cannot find
 * the appId or the domainId.
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param region i.e. us-west-2
 * @param domainOrAppId The domainId/appId
 * @returns
 */
export const lookupCustomerAccountId = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainOrAppId: string
): Promise<string | null> => {
  if (!domainOrAppId) {
    console.log("Invalid app or domain");
    return null;
  }

  try {
    console.log("Looking up domainId", domainOrAppId);
    const domainItem = await dynamodb.send(
      new QueryCommand({
        TableName: `${stage}-${region}-Domain`,
        IndexName: "domainId-index",
        KeyConditionExpression: "domainId = :domainId",
        ExpressionAttributeValues: {
          ":domainId": domainOrAppId,
        },
        ProjectionExpression: "appId",
      })
    );

    let appId = domainOrAppId;

    if (domainItem.Items && domainItem.Items.length > 0) {
      appId = domainItem.Items[0].appId;
    }

    console.log("Looking up appId", appId);
    const item = await dynamodb.send(
      new GetCommand({
        TableName: `${stage}-${region}-App`,
        AttributesToGet: ["accountId"],
        Key: {
          appId: appId.trim(),
        },
      })
    );

    if (!item.Item) {
      console.log("App not found", item);
      return null;
    }

    return item.Item.accountId;
  } catch (err) {
    console.error("App not found", err);
    return null;
  }
};

/**
 * Checks in the app table to determine if an App exists with the given
 * appId. Returns true if it does, or false otherwise.
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param stage i.e. beta, gamma, prod
 * @param region i.e. us-west-2
 * @param appId The appId to lookup
 *
 * @returns true or false
 */
export const checkAppExists = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string
): Promise<boolean> => {
  try {
    console.log("Looking up appId in App table", appId);
    const queryResponse = await dynamodb.send(
      new GetCommand({
        TableName: `${stage}-${region}-App`,
        ProjectionExpression: "appId",
        Key: {
          appId,
        },
      })
    );

    if (!queryResponse.Item) {
      console.log("App not found", appId);
      return false;
    }

    console.log("App exists", appId);
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.log("App not found", appId);
      return false;
    } else {
      console.error("Failed to lookup app", appId);
      throw err;
    }
  }
};

/**
 * Returns an iterator to paginate the Apps table. You can use the iterator
 * with `for await (const batch of paginateApps())`. Each batch will contain
 * a list of apps. It uses lazy loading so it doesn't consume the next page
 * until the iterator reaches the end.
 * 
 * @param documentClient DynamoDB document client
 * @param stage i.e. beta, prod, gamma
 * @param region i.e. us-west-2
 * @param attributesToGet i.e. ["appId", "platform"]
 * 
 * @returns Iterator of pages
 */
export const paginateApps = (
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  attributesToGet: string[] = ["appId"]
) => {
  return paginateScan(
    {
      pageSize: 1000,
      client: documentClient,
    },
    {
      TableName: `${stage}-${region}-App`,
      ProjectionExpression: attributesToGet.join(","),
    }
  );
};
