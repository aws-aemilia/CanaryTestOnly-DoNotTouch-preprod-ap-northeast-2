import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { BranchInfo } from "./get-branches-for-edge-config-comparison";
import { LAMBDA_EDGE_CONFIG_TABLE_NAME } from "./constants";
import sleep from "../utils/sleep";

const DELAY_TO_AVOID_THROTTLING = 2000; // two seconds
const BRANCH_CONFIG_EXPRESSION = "#branchConfig";
const BRANCH_CONFIG_EXPRESSION_NAME = "branchConfig";
const BRANCH_NAME_EXPRESS_PREFIX = "#branchName";

export async function removeBranchEntriesFromLambdaEdgeConfig({
  appId,
  branchesToRemove,
  documentClient,
}: {
  appId: string;
  branchesToRemove: BranchInfo[];
  documentClient: DynamoDBDocumentClient;
}) {
  /**
   * We will be removing branchConfig entries atomically.
   * They will be batched into 10 REMOVEs at a time.
   * There will be a delay of 1 seconds between each delete
   */
  const mutableBranchesToRemove = [...branchesToRemove];

  while (mutableBranchesToRemove.length) {
    const { updateExpression, expressionAttributeNames } =
      getUpdateExpressionAndExpressionAttributeNamesForBranchesToBeRemoved(
        mutableBranchesToRemove
      );

    const updateCommandParams = {
      TableName: LAMBDA_EDGE_CONFIG_TABLE_NAME,
      Key: {
        appId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
    };

    await documentClient.send(new UpdateCommand(updateCommandParams));

    console.log("Removed 10 entries. Waiting before next batch of removals...");
    await sleep(DELAY_TO_AVOID_THROTTLING);
  }
}

function getUpdateExpressionAndExpressionAttributeNamesForBranchesToBeRemoved(
  mutableBranchesToRemove: BranchInfo[]
) {
  // This function will actively mutate the `mutableBranchesToRemove` variable
  const updateExpressions: string[] = [];
  const expressionAttributeNames: { [key: string]: string } = {
    [BRANCH_CONFIG_EXPRESSION]: BRANCH_CONFIG_EXPRESSION_NAME,
  };

  let numberCreated = 0;
  do {
    const branchNameExpression = `${BRANCH_NAME_EXPRESS_PREFIX}${numberCreated}`;
    updateExpressions.push(
      `${BRANCH_CONFIG_EXPRESSION}.${branchNameExpression}`
    );

    const branchToRemove = mutableBranchesToRemove.pop()!;
    expressionAttributeNames[branchNameExpression] = branchToRemove.branchName;
    numberCreated += 1;
  } while (numberCreated < 10 && mutableBranchesToRemove.length > 0);

  return {
    updateExpression: `REMOVE ${updateExpressions.join(",")}`,
    expressionAttributeNames,
  };
}
