import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { AmplifyAccount } from "../commons/Isengard";

export interface DomainInfo {
  domainId: string;
}

export async function getDomainIdsForApp({
  appId,
  documentClient,
  regionAccount,
}: {
  appId: string;
  documentClient: DynamoDBDocumentClient;
  regionAccount: AmplifyAccount;
}) {
  const tableName = `${regionAccount.stage}-${regionAccount.region}-Domain`;

  console.log(
    `Getting domain ids for AppId: ${appId} from Table: ${tableName}`
  );
  const allDomains: DomainInfo[] = [];
  let lastEvaluatedKey;

  do {
    const result: QueryCommandOutput = await documentClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "appId = :appId",
        ExpressionAttributeValues: {
          ":appId": appId,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      })
    );

    if (result.Items) {
      result.Items.forEach((item) => {
        allDomains.push({
          domainId: item?.domainId,
        });
      });
    }

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  if (allDomains.length === 0) {
    console.warn(`⚠️⚠️⚠️⚠️ No Domains found for AppId: ${appId} ⚠️⚠️⚠️⚠️`);
    console.warn(
      "⚠️⚠️⚠️⚠️ This could be valid if no custom domains have been associated... ⚠️⚠️⚠️⚠️"
    );
  }

  return allDomains;
}
