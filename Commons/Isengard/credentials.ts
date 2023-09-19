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
];

// Accounts where is safe to assume high risk roles like Admin
const lowRiskAccountIds = [...integTestAccounts.map((acc) => acc.accountId)];

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

  try {
    const creds = await getAssumeRoleCredentials({
      awsAccountID: accountId,
      iamRoleName,
    });
    return {
      ...creds,
      expiration: new Date(creds.expiration),
    };
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
