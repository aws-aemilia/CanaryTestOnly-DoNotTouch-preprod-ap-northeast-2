import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

/**
 * Looks up the customer account ID based on a given appId. It uses the 
 * App table in the Control Plane account. This query is safe to run 
 * because it doesn't fetch customer data. Returns null if it cannot find
 * the appId.
 * 
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param region i.e. us-west-2
 * @param appId AppId 
 * @returns 
 */
export const lookupCustomerAccountId = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string
): Promise<string | null> => {
  if (!appId) {
    console.log("Invalid app");
    return null;
  }

  try {
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
      console.log("App not found");
      return null;
    }

    return item.Item.accountId;
  } catch (err) {
    console.log("App not found");
    return null;
  }
};
