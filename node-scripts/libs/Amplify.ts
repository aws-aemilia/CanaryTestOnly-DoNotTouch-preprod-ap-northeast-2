import { BatchGetItemCommand } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AppDOItem } from "../dynamodb";

export async function getAppsByAppIds(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appIds: string[]
): Promise<AppDOItem[]> {
  const appTableName = `${stage}-${region}-App`;

  const result = await dynamodb.send(
    new BatchGetItemCommand({
      RequestItems: {
        [appTableName]: {
          Keys: [
            ...appIds.map((appId) => ({
              appId: { S: appId },
            })),
          ],
        },
      },
    })
  );

  if (!result.Responses) {
    console.info("Db returned no response for keys: ", appIds);
    return [];
  }

  if (
    result.UnprocessedKeys &&
    Object.keys(result.UnprocessedKeys).length > 0
  ) {
    console.error(result.UnprocessedKeys);
    throw new Error("Db returned unprocessed keys");
  }

  return result.Responses[appTableName] as unknown as AppDOItem[];
}
