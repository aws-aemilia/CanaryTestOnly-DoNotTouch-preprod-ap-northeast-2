import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getReconcileParameters } from "./get-reconcile-parameters";
import { getBranchesForEdgeConfigComparison } from "./get-branches-for-edge-config-comparison";
import { getDomainIdsForApp } from "./get-domain-ids-for-app";
import { getEdgeConfigBranches } from "./get-edge-config-branches";
import { findOrphanedEdgeConfigEntries } from "./find-orphanes-edge-config-entries";
import { removeBranchEntriesFromLambdaEdgeConfig } from "./remove-branch-entries-from-lambda-edge-config";
import promptFunc from "prompt-sync";

const prompt = promptFunc();

(async function () {
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

  const domains = await getDomainIdsForApp({
    appId,
    documentClient,
    regionAccount,
  });

  const lambdaEdgeConfigIdsFromDomains = domains.map(
    (oneDomain) => oneDomain.domainId
  );

  const lambdaEdgeConfigIdsToUpdate: string[] = [
    appId,
    ...lambdaEdgeConfigIdsFromDomains,
  ];

  console.log("lambdaEdgeConfigIdsToUpdate", lambdaEdgeConfigIdsToUpdate);

  for (const lambdaEdgeConfigId of lambdaEdgeConfigIdsToUpdate) {
    console.log(
      `\n\nBeginning work on LambdaEdgeConfig id: ${lambdaEdgeConfigId}`
    );

    const edgeConfigBranches = await getEdgeConfigBranches({
      appId: lambdaEdgeConfigId,
      documentClient,
    });

    const edgeConfigBranchesThatShouldBeDeleted = findOrphanedEdgeConfigEntries(
      {
        existingBranches,
        edgeConfigBranches,
      }
    );

    console.log("Existing branches for app:\n", existingBranches);

    if (edgeConfigBranchesThatShouldBeDeleted.length === 0) {
      console.log(
        "LambdaEdgeConfig does not contain any orphaned branch entries. Continuing to next id..."
      );
      continue;
    }

    console.log(
      `The following branches will be removed from the LambdaEdgeConfig table id: ${lambdaEdgeConfigId}\n`,
      JSON.stringify(edgeConfigBranchesThatShouldBeDeleted, null, 2)
    );

    if (isDryRun) {
      console.log('Running in "Dry Run" mode. Skipping removal...');
      continue;
    }

    const shouldContinueResponse =
      prompt("Continue? (y/n)").toLocaleLowerCase();

    if (shouldContinueResponse !== "y") {
      console.log("Aborting...");
      return;
    }

    await removeBranchEntriesFromLambdaEdgeConfig({
      appId: lambdaEdgeConfigId,
      branchesToRemove: edgeConfigBranchesThatShouldBeDeleted,
      documentClient,
    });

    console.log(
      `\n\n\nSuccessfully removed Orphaned branches from LambdaEdgeConfig for id: ${lambdaEdgeConfigId}`
    );
  }
})().catch(console.error);
