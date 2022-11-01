import { Credentials, Provider } from "@aws-sdk/types";
import { getAssumeRoleCredentials } from "@amzn/isengard";
import { getCAZToken, isContingentAuthNeeded } from "./contingentAuthZ";

const allowedRoles = ['ReadOnly', 'OncallOperator', 'SupportOps', 'NAPS-Admin', 'Route53Manager', 'FullReadOnly'];

const getIsengardCredentials = async (
  accountId: string, iamRoleName="ReadOnly"
): Promise<Credentials> => {

  if (!allowedRoles.includes(iamRoleName)) {
    throw new Error(`Refusing to provide credentials for role ${iamRoleName}. Consider using one of ${allowedRoles} instead`)
  }

  const cazToken: string | undefined = (await isContingentAuthNeeded(
    accountId,
    iamRoleName
  ))
    ? await getCAZToken(accountId)
    : undefined;

  const creds = await getAssumeRoleCredentials({
    awsAccountID: accountId,
    iamRoleName,
    cazToken,
  });
  return {
    ...creds,
    expiration: new Date(creds.expiration),
  };
};

/**
 * returns a credentialsProvider that can be passed to the AWS SDK v3 clients
 * @param accountId
 * @param iamRoleName
 */
export const getIsengardCredentialsProvider = (
  accountId: string, iamRoleName="ReadOnly"
): Provider<Credentials> => getIsengardCredentials.bind(null, accountId, iamRoleName);
