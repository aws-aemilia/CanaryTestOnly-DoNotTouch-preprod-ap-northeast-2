import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
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
