import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export type PayerToken = {
  accountId: string;
  accountAbuseStatus: string;
  accountStatus: string;
  isValid: number;
  lastChecked: string;
  payerToken: string;
  version: number;
};

export const getPayerToken = async (
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  accountId: string
): Promise<PayerToken | undefined> => {
  const result = await documentClient.send(
    new GetCommand({
      TableName: `${stage}-${region}-PayerTokenTable`,
      Key: { accountId },
    })
  );
  return result.Item ? (result.Item as PayerToken) : undefined;
};
