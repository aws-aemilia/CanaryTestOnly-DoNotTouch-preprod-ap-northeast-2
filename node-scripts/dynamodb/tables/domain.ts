import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Checks in the domain table to determine if a domain exists with the
 * given domainId. Returns true if it does, false otherwise.
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param stage i.e. beta, gamma, prod
 * @param region i.e. us-west-2
 * @param domainId The appId to lookup
 *
 * @returns true or false
 */
export const checkDomainExists = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainId: string
): Promise<boolean> => {
  try {
    console.log("Looking up domain in Domain table", domainId);
    const queryResponse = await dynamodb.send(
      new QueryCommand({
        TableName: `${stage}-${region}-Domain`,
        IndexName: "domainId-index",
        ProjectionExpression: "domainId",
        KeyConditionExpression: "domainId = :domainId",
        ExpressionAttributeValues: {
          ":domainId": domainId,
        },
      })
    );

    if (!queryResponse.Items || queryResponse.Items.length === 0) {
      console.log("Domain not found", domainId);
      return false;
    }

    console.log("Domain exists", domainId);
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.log("Domain not found", domainId);
      return false;
    } else {
      console.error("Failed to lookup domain", domainId);
      throw err;
    }
  }
};
