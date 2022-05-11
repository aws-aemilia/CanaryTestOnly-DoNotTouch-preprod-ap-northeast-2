import { Credentials, Provider } from "@aws-sdk/types";
import { getAssumeRoleCredentials } from "@amzn/isengard";

const getIsengardCredentials = async (
  accountId: string
): Promise<Credentials> => {
  const creds = await getAssumeRoleCredentials({
    awsAccountID: accountId,
    iamRoleName: "ReadOnly",
  });
  return {
    ...creds,
    expiration: new Date(creds.expiration),
  };
};

/**
 * returns a credentialsProvider that can be passed to the AWS SDK v3 clients
 * @param accountId
 */
export const getIsengardCredentialsProvider = (
  accountId: string
): Provider<Credentials> => getIsengardCredentials.bind(null, accountId);
