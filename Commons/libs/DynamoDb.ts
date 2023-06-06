import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";

export async function getDDbClient(account: AmplifyAccount) {
  const credentials = getIsengardCredentialsProvider(account.accountId);
  const dynamodbClient = new DynamoDBClient({
    region: account.region,
    credentials,
  });
  return DynamoDBDocumentClient.from(dynamodbClient);
}
