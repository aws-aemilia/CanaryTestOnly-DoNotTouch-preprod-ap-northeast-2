import { DynamoDBAttributeName } from "./types";
import { Credentials, Provider } from "@aws-sdk/types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Region } from "../Isengard";

export const getDynamoDBDocumentClient = (
  region: Region,
  credentials?: Provider<Credentials>
) => {
  const ddb = new DynamoDBClient({
    region,
    credentials,
  });
  return DynamoDBDocumentClient.from(ddb);
};
