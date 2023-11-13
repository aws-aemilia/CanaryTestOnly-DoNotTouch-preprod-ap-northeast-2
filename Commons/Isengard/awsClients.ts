import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AmplifyAccount } from "Commons/Isengard/accounts";
import { getIsengardCredentialsProvider } from "Commons/Isengard/credentials";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export const buildCloudWatchLogsClient = (
  acc: AmplifyAccount,
  role = "ReadOnly"
): CloudWatchLogsClient =>
  new CloudWatchLogsClient({
    region: acc.region,
    credentials: getIsengardCredentialsProvider(acc.accountId, role),
  });

export const getDynamoDBDocumentClient = (
  acc: AmplifyAccount,
  role = "ReadOnly"
): DynamoDBDocumentClient => {
  const dynamoDBClient = new DynamoDBClient({
    region: acc.region,
    credentials: getIsengardCredentialsProvider(acc.accountId, role),
  });
  return DynamoDBDocumentClient.from(dynamoDBClient);
};
