import {
  batchEvaluateContingentAuthorization,
  getAWSAccountClassification,
  getIAMRole,
  RiskLevel,
} from "@amzn/isengard";
import { EvaluateContingentAuthorizationEntry } from "@amzn/isengard/dist/src/contingent-authorization/types";
import { spawnSync } from "child_process";
import { BatchIterator } from "Commons/utils/BatchIterator";
import confirm from "../utils/confirm";
import { AmplifyAccount } from "./accounts";

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
  role?: string
): EvaluateContingentAuthorizationEntry => {
  return {
    Resource: `arn:aws:iam::${account.accountId}:${
      role ? `role/${role}` : "root"
    }`,
    Action: "*",
  };
};

interface PreflightCAZParams {
  accounts: AmplifyAccount | AmplifyAccount[];
  role: string | string[];
}

const preflightCAZFlow = async ({
  accounts,
  role,
}: {
  accounts: AmplifyAccount | AmplifyAccount[];
  role?: string | string[];
}) => {
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

  await batchEvaluateCAZ(EvaluateContingentAuthorizationEntries);
};

async function evaluateCAZ(
  EvaluateContingentAuthorizationEntries: EvaluateContingentAuthorizationEntry[]
) {
  const batchEvaluateContingentAuthorizationResponse =
    await batchEvaluateContingentAuthorization({
      ContingentAuthorizationVersion: "1.0",
      EvaluateContingentAuthorizationEntries,
    });

  const workflowUrl = batchEvaluateContingentAuthorizationResponse.WorkflowUrl;
  if (workflowUrl === undefined) {
    // no url is returned when none of the accounts need CAZ
    return;
  }

  console.log(
    `Requested Contingent Authorization for Roles: ${EvaluateContingentAuthorizationEntries.map(
      (a) => a.Resource
    ).join(", ")}\n`
  );

  console.log(workflowUrl);
  console.log(
    "\nGo to the above URL to provide justification for CAZ. You may skip this step if you have provided CAZ justification for the exact same Accounts and Role in the last hour"
  );
  spawnSync("open", [workflowUrl]); // Open the workflow URL in the default browser

  const confirmed: boolean = await confirm("Are you ready to continue?");
  if (!confirmed) {
    throw new Error(
      "CAZ justification is required to continue. Please provide justification and try again."
    );
  }
}

const batchEvaluateCAZ = async (
  EvaluateContingentAuthorizationEntries: EvaluateContingentAuthorizationEntry[]
) => {
  // Isengard can only evaluate up to 100 CAZ entries at once, so we split them up into smaller batches
  const entryBatches = new BatchIterator(
    EvaluateContingentAuthorizationEntries,
    100
  );

  for (const entryBatch of entryBatches) {
    await evaluateCAZ(entryBatch);
  }
};

/**
 * Makes a preflight request to Isengard for Contingent Authorization (CAZ)
 * <br>
 * This will print the URL that you need to visit to provide justification for CAZ.
 */
export const preflightCAZ = async ({ accounts, role }: PreflightCAZParams) =>
  preflightCAZFlow({ accounts, role });

/**
 * Makes a preflight request to Isengard for Contingent Authorization (CAZ). This authorizes administrative Isengard APIs (e.g. createIAMRole)
 * <br>
 * This will print the URL that you need to visit to provide justification for CAZ.
 */
export const preflightCAZForAdministrativeIsengardCalls = async (
  accounts: AmplifyAccount[]
) => preflightCAZFlow({ accounts });

/**
 * Makes a preflight request to Isengard for Contingent Authorization (CAZ) for the given array of account and role combinations.
 * <br>
 * This will print the URL that you need to visit to provide justification for CAZ.
 */
export const preflightCAZForAccountRoleCombinations = async (
  accountRoles: {
    account: AmplifyAccount;
    role: string;
  }[]
) => {
  const EvaluateContingentAuthorizationEntries = [];

  // sequentially since Isengard has low limits
  for (const { account, role } of accountRoles) {
    EvaluateContingentAuthorizationEntries.push(
      toPreflightRequest(account, role)
    );
  }

  if (EvaluateContingentAuthorizationEntries.length === 0) {
    // no accounts need CAZ
    return;
  }

  await batchEvaluateCAZ(EvaluateContingentAuthorizationEntries);
};
