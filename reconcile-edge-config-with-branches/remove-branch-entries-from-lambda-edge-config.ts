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
    expressionAttributeNames[branchNameExpression] = formatBranchName(
      branchToRemove.branchName
    );
    numberCreated += 1;
  } while (numberCreated < 10 && mutableBranchesToRemove.length > 0);

  return {
    updateExpression: `REMOVE ${updateExpressions.join(",")}`,
    expressionAttributeNames,
  };
}

// https://code.amazon.com/packages/AWSAmplifyDeploymentProcessor/blobs/5f01b64684e574dbef6b8c6d57b27746bec9331c/--/src/runner/helpers/ddbHelper.ts#L276
function formatBranchName(branchName: string): string {
  // Entries in the branchConfig property are modified from the original branchName
  // All none alphanumeric characters are replaced with "-", then all leading and trailing "-" are stripped
  return branchName
    .toLowerCase()
    .replace(/[^-a-z0-9]/gi, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
