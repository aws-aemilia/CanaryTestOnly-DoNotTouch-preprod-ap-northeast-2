import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { Region } from "../Isengard";

export const getDynamoDBDocumentClient = (
  region: Region,
  credentials?: Provider<AwsCredentialIdentity>
) => {
  const ddb = new DynamoDBClient({
    region,
    credentials,
  });
  return DynamoDBDocumentClient.from(ddb);
};
