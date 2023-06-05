import { BranchInfo } from "./get-branches-for-edge-config-comparison";

export function findOrphanedEdgeConfigEntries({
  edgeConfigBranches,
  existingBranches,
}: {
  edgeConfigBranches: BranchInfo[];
  existingBranches: BranchInfo[];
}) {
  const existingBranchMap: { [key: string]: BranchInfo } = {};
  existingBranches.forEach((branch) => {
    existingBranchMap[branch.branchName] = branch;
  });

  const orphanedEdgeConfigEntries: BranchInfo[] = [];
  edgeConfigBranches.forEach((edgeCondigBranch) => {
    if (!existingBranchMap[edgeCondigBranch.branchName]) {
      orphanedEdgeConfigEntries.push(edgeCondigBranch);
    }
  });

  return orphanedEdgeConfigEntries;
}
