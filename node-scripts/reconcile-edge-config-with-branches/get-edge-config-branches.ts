import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { LAMBDA_EDGE_CONFIG_TABLE_NAME } from "./constants";

export async function getEdgeConfigBranches({
  appId,
  documentClient,
}: {
  appId: string;
  documentClient: DynamoDBDocumentClient;
}) {
  console.log(
    `Getting branches for id: ${appId} from Table: ${LAMBDA_EDGE_CONFIG_TABLE_NAME}`
  );

  const result = await documentClient.send(
    new GetCommand({
      TableName: LAMBDA_EDGE_CONFIG_TABLE_NAME,
      Key: {
        appId,
      },
    })
  );

  if (!result.Item) {
    throw new Error(
      `⚠️⚠️⚠️⚠️ No entry found in edge config table for appId: ${appId} ⚠️⚠️⚠️⚠️`
    );
  }

  return Object.values(result.Item.branchConfig).map((item: any) => ({
    branchName: item.branchName,
  }));
}
