//arn:aws:amplify:ap-northeast-2:024873182396:apps/d2zc7760bjhgcv/branches/branch7371
export function parseBranchArn(branchArn: string) {
  const segments = branchArn.split(":");
  if (segments.length < 6) {
    throw new Error(`Illegal branchArn ${branchArn}`);
  }
  const region = segments[3];
  const accountId = segments[4];
  const lastSegment = segments[5];
  const lastSegmentSplit = lastSegment.split("/");
  const appId = lastSegmentSplit[1];
  const branch = lastSegmentSplit.slice(3).join("/");

  return { region, accountId, appId, branch };
}
