import integTestAccounts from "./cache/integTestAccounts.json";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { getAssumeRoleCredentials } from "@amzn/isengard";

const allowedRoles = [
  "ReadOnly",
  "OncallOperator",
  "SupportOps",
  "NAPS-Admin",
  "Route53Manager",
  "FullReadOnly",
  "ReleaseCustomDomain",
  "TicketyFullAccess",
  "SDCLimitManagement",
  "LambdaInvoker",
  "AHIORollback",
  "ExtendComputeRollback",
  "ECRPutImageRole",
  "AL2023MCMRole",
];

// Accounts where is safe to assume high risk roles like Admin
const lowRiskAccountIds = [...integTestAccounts.map((acc) => acc.accountId)];

const credentialsCache = new Map<string, AwsCredentialIdentity>();

const getIsengardCredentials = async (
  accountId: string,
  iamRoleName = "ReadOnly"
): Promise<AwsCredentialIdentity> => {
  if (
    !lowRiskAccountIds.includes(accountId) &&
    !allowedRoles.includes(iamRoleName)
  ) {
    throw new Error(
      `Refusing to provide credentials for role ${iamRoleName}. Consider using one of ${allowedRoles} instead`
    );
  }

  const cachedCred = credentialsCache.get(`${accountId}-${iamRoleName}`);
  const currentDate = new Date();
  if (cachedCred && cachedCred.expiration! > currentDate) {
    return cachedCred;
  }
  try {
    const creds = await getAssumeRoleCredentials({
      awsAccountID: accountId,
      iamRoleName,
    });
    const res = {
      ...creds,
      expiration: new Date(creds.expiration),
    };
    credentialsCache.set(`${accountId}-${iamRoleName}`, res);
    return res;
  } catch (e) {
    const fancyErrorMessage = `
 ┌─────────────────────────────────────────────────────────────────────┐
 │ Failed to get Isengard credentials!                                 │
 │ Make sure that you are connected to the VPN and that you ran mwinit │
 └─────────────────────────────────────────────────────────────────────┘
`;

    console.error(fancyErrorMessage);
    console.error(
      "Exception on getIsengardCredentials was:",
      (e as Error).message
    );
    throw e;
  }
};

/**
 * returns a credentialsProvider that can be passed to the AWS SDK v3 clients
 * @param accountId
 * @param iamRoleName
 */
export const getIsengardCredentialsProvider = (
  accountId: string,
  iamRoleName = "ReadOnly"
): Provider<AwsCredentialIdentity> =>
  getIsengardCredentials.bind(null, accountId, iamRoleName);
