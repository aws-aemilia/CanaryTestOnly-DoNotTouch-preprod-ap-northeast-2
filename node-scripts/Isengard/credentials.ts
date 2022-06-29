import { Credentials, Provider } from "@aws-sdk/types";
import { getAssumeRoleCredentials } from "@amzn/isengard";

const allowedRoles = ['ReadOnly', 'OncallOperator', 'SupportOps', 'NAPS-Admin'];

const getIsengardCredentials = async (
  accountId: string, iamRoleName="ReadOnly"
): Promise<Credentials> => {

  if (!allowedRoles.includes(iamRoleName)) {
    throw new Error(`Refusing to provide credentials for role ${iamRoleName}. Consider using one of ${allowedRoles} instead`)
  }

  const creds = await getAssumeRoleCredentials({
    awsAccountID: accountId,
    iamRoleName
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
