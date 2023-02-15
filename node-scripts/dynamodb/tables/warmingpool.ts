import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Returns an item from the WarmFrontEndResources
 * 
 * @param dynamodb DocumentClient
 * @param stage i.e. beta, prod, gamma
 * @param region i.e. us-west-2
 * @param resourceId The ID for the warm resource
 * 
 * @returns a DynanmoDB item or null if not found
 */
export const getWarmResource = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  resourceId: string
): Promise<object | null> => {
  try {
    console.log("Looking up resource in WarmFrontEndResources table", resourceId);
    const queryResponse = await dynamodb.send(
      new GetCommand({
        TableName: `${stage}-${region}-WarmFrontEndResources`,
        ProjectionExpression: "resourceId",
        Key: {
          resourceId,
        },
      })
    );

    if (!queryResponse.Item) {
      console.log("Resource not found", resourceId);
      return null;
    }

    console.log("Resource exists", resourceId);
    return queryResponse.Item;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.log("Resource not found", resourceId);
      return null;
    } else {
      console.error("Failed to lookup domain", resourceId);
      throw err;
    }
  }
};
