import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
} from "../../../../Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandOutput,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

import base64 from "base64-js";
import { readSecretFn } from "./types";

const TABLE_NAME = "LambdaEdgeConfig";

const encodeSecret = (secret: string): string => {
  return base64.fromByteArray(Buffer.from(secret));
};
const decodeSecret = (encoded: string): string => {
  return Buffer.from(base64.toByteArray(encoded)).toString();
};
export const readSecret: readSecretFn = async (account: AmplifyAccount) => {
  const dynamodb = new DynamoDBClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId),
  });
  const documentClient = DynamoDBDocumentClient.from(dynamodb);

  const command = new GetCommand({
    Key: {
      appId: "COMPUTE_SERVICE_SECRET_HEADER",
    },
    TableName: TABLE_NAME,
  });

  const result: GetCommandOutput = await documentClient.send(command);

  if (result.Item === undefined) {
    return {
      meta: `${account.email} - DDB ${TABLE_NAME}, COMPUTE_SERVICE_SECRET_HEADER item not found`,
    };
  }

  return {
    value: decodeSecret(result.Item["computeServiceSecretHeaderValue"]),
    meta: `${account.email} - DDB ${TABLE_NAME}, COMPUTE_SERVICE_SECRET_HEADER`,
  };
};

export const writeSecret = async (
  account: AmplifyAccount,
  secret: string
): Promise<void> => {
  console.log(
    `Writing secret to DDB at ${account.region}:${account.accountId}`
  );

  const dynamodb = new DynamoDBClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });
  const documentClient = DynamoDBDocumentClient.from(dynamodb);

  const command = new PutCommand({
    Item: {
      appId: "COMPUTE_SERVICE_SECRET_HEADER",
      computeServiceSecretHeaderValue: encodeSecret(secret),
    },
    TableName: TABLE_NAME,
  });

  await documentClient.send(command);
};
