import {
  batchEvaluateContingentAuthorization,
  getAWSAccountClassification,
  getIAMRole,
  RiskLevel,
} from "@amzn/isengard";
import { AmplifyAccount } from "./accounts";
import { EvaluateContingentAuthorizationEntry } from "@amzn/isengard/dist/src/contingent-authorization/types";
import confirm from "../utils/confirm";

/**
 * Taken from https://code.amazon.com/packages/BenderLibIsengard/blobs/a8494f0efbec05349f301c6c24f7e97640cfdb9d/--/src/isengard/_cli/functions.py#L53
 */
export const isContingentAuthNeeded = async (
  accountId: string,
  role: string
): Promise<boolean> => {
  const classification = await getAWSAccountClassification({
    awsAccountID: accountId,
  });

  if (!classification.IsProduction) {
    return false;
  }

  const getIAMRoleResponse = await getIAMRole({
    AWSAccountID: accountId,
    IAMRoleName: role,
  });

  return (
    getIAMRoleResponse.IAMRole.RiskLevel !== RiskLevel.LOW &&
    (classification.HasCustomerData ||
      classification.HasCustomerMetadata ||
      (classification as any).IsContingentAuthProtected) // IsContingentAuthProtected is missing from the type definition
  );
};

const toPreflightRequest = (
  account: AmplifyAccount,
  role: string
): EvaluateContingentAuthorizationEntry => {
  return {
    Resource: `arn:aws:iam::${account.accountId}:role/${role}`,
    Action: "*",
  };
};

interface PreflightCAZParams {
  accounts: AmplifyAccount | AmplifyAccount[];
  role: string | string[];
}

export const preflightCAZ = async ({ accounts, role }: PreflightCAZParams) => {
  const accountsArray = Array.isArray(accounts) ? accounts : [accounts];
  const roleArray = Array.isArray(role) ? role : [role];

  const EvaluateContingentAuthorizationEntries = [];
  // sequentially since Isengard has low limits
  for (const account of accountsArray) {
    for (const role of roleArray) {
      EvaluateContingentAuthorizationEntries.push(
        toPreflightRequest(account, role)
      );
    }
  }

  if (EvaluateContingentAuthorizationEntries.length === 0) {
    // no accounts need CAZ
    return;
  }

  console.log(
    `Requesting Contingent Authorization for Roles: ${EvaluateContingentAuthorizationEntries.map(
      (a) => a.Resource
    ).join(", ")}\n`
  );

  const batchEvaluateContingentAuthorizationResponse =
    await batchEvaluateContingentAuthorization({
      ContingentAuthorizationVersion: "1.0",
      EvaluateContingentAuthorizationEntries,
    });

  console.log(batchEvaluateContingentAuthorizationResponse.WorkflowUrl);
  console.log(
    "\nGo to the above URL to provide justification for CAZ. You may skip this step if you have provided CAZ justification for the exact same Accounts and Role in the last hour"
  );
  const confirmed: boolean = await confirm("Are you ready to continue?");
  if (!confirmed) {
    throw new Error(
      "CAZ justification is required to continue. Please provide justification and try again."
    );
  }
};
