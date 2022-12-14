import {
  DynamoDBDocumentClient,
  QueryCommand,
  QueryCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { AmplifyAccount } from "../Isengard";

export interface BranchInfo {
  branchName: string;
}

export async function getBranchesForEdgeConfigComparison({
  appId,
  documentClient,
  regionAccount,
}: {
  appId: string;
  documentClient: DynamoDBDocumentClient;
  regionAccount: AmplifyAccount;
}) {
  const tableName = `${regionAccount.stage}-${regionAccount.region}-Branch`;

  console.log(`Getting branches for AppId: ${appId} from Table: ${tableName}`);
  const allBranches: BranchInfo[] = [];
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

    if (!result.Items) {
      console.warn(`⚠️⚠️⚠️⚠️ No Branched found for AppId: ${appId} ⚠️⚠️⚠️⚠️`);
      console.warn(
        "⚠️⚠️⚠️⚠️ This could be valid if all branches have been deleted... ⚠️⚠️⚠️⚠️"
      );
      return [];
    }

    result.Items.forEach((item) => {
      allBranches.push({
        branchName: item?.branchName,
      });
    });

    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allBranches;
}
