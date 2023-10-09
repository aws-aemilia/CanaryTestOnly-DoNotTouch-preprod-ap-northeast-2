import { DynamoDBClient, DynamoDBClientConfig } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  AmplifyAccount,
  Region,
  StandardRoles,
  getIsengardCredentialsProvider,
} from "../Isengard";
import { memoizeWith } from "ramda";

export async function getDDbClient(account: AmplifyAccount) {
  const credentials = getIsengardCredentialsProvider(account.accountId);
  const dynamodbClient = new DynamoDBClient({
    region: account.region,
    credentials,
  });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

/**
 * Memoize dynamodb client by region, accountId and role
 */
export const getMemoizedDynamoDBClient = memoizeWith(
  (region: Region, accountId: string, role: StandardRoles) =>
    `${region}-${accountId}-${role}`,
  (
    region: Region,
    accountId: string,
    role: StandardRoles,
    options?: DynamoDBClientConfig
  ): DynamoDBDocumentClient => {
    const dynamoDb = new DynamoDBClient({
      region,
      credentials: getIsengardCredentialsProvider(accountId, role),
      ...options,
    });
    const dynamodbClient = DynamoDBDocumentClient.from(dynamoDb);
    return dynamodbClient;
  }
);
