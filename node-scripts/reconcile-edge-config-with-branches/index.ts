import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getReconcileParameters } from "./get-reconcile-parameters";
import { getBranchesForEdgeConfigComparison } from "./get-branches-for-edge-config-comparison";
import { getEdgeConfigBranches } from "./get-edge-config-branches";
import { findOrphanedEdgeConfigEntries } from "./find-orphanes-edge-config-entries";
import { removeBranchEntriesFromLambdaEdgeConfig } from "./remove-branch-entries-from-lambda-edge-config";
import promptFunc from "prompt-sync";

const prompt = promptFunc();

(async function () {

  console.log(
    "This script requires additional work to clean up all of the domain entries in the LambdaEdgeConfig table that duplicate the AppId entry. This will be done in a follow up CR."
  );
  process.exit(-99);

  const { appId, credentials, isDryRun, regionAccount } =
    await getReconcileParameters();

  const ddbClient = new DynamoDBClient({
    region: regionAccount.region,
    credentials,
  });
  const documentClient = DynamoDBDocumentClient.from(ddbClient);

  const existingBranches = await getBranchesForEdgeConfigComparison({
    appId,
    documentClient,
    regionAccount,
  });

  const edgeConfigBranches = await getEdgeConfigBranches({
    appId,
    documentClient,
  });

  const edgeConfigBranchesThatShouldBeDeleted = findOrphanedEdgeConfigEntries({
    existingBranches,
    edgeConfigBranches,
  });

  console.log("Existing branches for app:\n", existingBranches);
  console.log("Branches in LambdaEdgeConfig:\n", edgeConfigBranches);

  if (edgeConfigBranchesThatShouldBeDeleted.length === 0) {
    console.log(
      "LambdaEdgeConfig does not contain any orphaned branch entries. Exiting..."
    );
    return;
  }

  console.log(
    `The following branches will be removed from the LambdaEdgeConfig table for App Id: ${appId}\n`,
    edgeConfigBranchesThatShouldBeDeleted
  );

  if (isDryRun) {
    console.log('Running in "Dry Run" mode. Exiting...');
    return;
  }

  const shouldContinueResponse = prompt("Continue? (y/n)").toLocaleLowerCase();

  if (shouldContinueResponse !== "y") {
    console.log("Aborting...");
    return;
  }

  await removeBranchEntriesFromLambdaEdgeConfig({
    appId,
    branchesToRemove: edgeConfigBranchesThatShouldBeDeleted,
    documentClient,
  });

  console.log(
    "\n\n\nSuccessfully removed Orphaned branches from LambdaEdgeConfig"
  );
})().catch(console.error);
