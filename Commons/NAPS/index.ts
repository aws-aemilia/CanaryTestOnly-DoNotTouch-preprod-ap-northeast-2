import { IAMAdmin } from "@amzn/aws-identity-management-admin-service-internal";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";

/**
 * Any account that is a member of amplify.aws.internal works
 * using aws-mobile-amplify-gamma-iad-console@amazon.com
 */
const adminAccount = "532897458220";

/**
 * Adds the accounts to the Service Principal.
 * If the account is already a member of the SP, the request succeeds without errors.
 * @param accounts
 * @param servicePrincipal
 */
export const addAccountsToServicePrincipal = async (
  accounts: AmplifyAccount[],
  servicePrincipal: string
) => {
  if (!servicePrincipal.endsWith("amplify.aws.internal")) {
    // will fail anyways due to missing permissions, but failing early is nice
    throw new Error(
      "You can only add accounts to internal Service Principals below 'amplify.aws.internal'"
    );
  }

  const client = new IAMAdmin({
    region: "us-east-1",
    endpoint: "https://iamadmin.amazonaws.com",
    credentials: await getIsengardCredentialsProvider(
      adminAccount,
      "NAPS-Admin"
    )(),
  });

  for (const account of accounts) {
    // addAccountToServicePrincipal succeeds if the account was already in the SP
    console.log(
      `Adding ${account.accountId} (${account.email}) to ${servicePrincipal}`
    );
    await client
      .addAccountToServicePrincipal({
        AccountId: account.accountId,
        ServicePrincipalName: servicePrincipal,
      })
      .promise();
    console.log("SUCCESS");
  }
};
