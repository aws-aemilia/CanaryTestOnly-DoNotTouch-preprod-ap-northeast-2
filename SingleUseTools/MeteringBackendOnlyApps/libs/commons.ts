import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
  StandardRoles,
} from "../../../Commons/Isengard";
import { BranchDAO } from "../../../Commons/dynamodb/tables/BranchDAO";
import { AppDO, BranchDO } from "../../../Commons/dynamodb";
import { AppDAO } from "../../../Commons/dynamodb/tables/AppDAO";

export async function getBranchlessApps(acc: AmplifyAccount): Promise<AppDO[]> {
  const branchDAO = new BranchDAO(
    acc.stage,
    acc.region,
    getIsengardCredentialsProvider(acc.accountId, StandardRoles.FullReadOnly)
  );

  const allBranches: BranchDO[] = [];

  for await (const paginateElement of branchDAO.paginate([
    "appId",
    "branchName",
    "branchArn",
  ])) {
    allBranches.push(...(paginateElement.Items! as BranchDO[]));
  }

  const appIdsWithBranches: Set<string> = new Set(
    allBranches.map((branch) => branch.appId)
  );

  const appDAO = new AppDAO(
    acc.stage,
    acc.region,
    getIsengardCredentialsProvider(acc.accountId, StandardRoles.FullReadOnly)
  );

  const allApps: AppDO[] = [];

  for await (const paginateElement of appDAO.paginate([
    "appId",
    "accountId",
    "cloudFrontDistributionId",
  ])) {
    allApps.push(...(paginateElement.Items! as AppDO[]));
  }

  return allApps.filter((app) => !appIdsWithBranches.has(app.appId));
}

export const toDistroARN = (acc: AmplifyAccount, distributionId: string) =>
  `arn:aws:cloudfront::${acc.accountId}:distribution/${distributionId}`;

export const toAppARN = (acc: AmplifyAccount, appId: string) =>
  `arn:aws:amplify:${acc.region}:${acc.accountId}:apps/${appId}`;
