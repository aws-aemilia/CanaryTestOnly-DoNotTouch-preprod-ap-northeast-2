import {
  dataPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";
import { AmplifyRole, upsertRole } from "Commons/Isengard/roles/upsertRole";

/**
 * One time use script to create the AHIORollback role
 */
async function main() {
  const accounts = await dataPlaneAccounts();

  await preflightCAZForAdministrativeIsengardCalls(accounts);

  const AHIORollbackRole: AmplifyRole = {
    IAMRoleName: "AHIORollback",
    Description: "Role used to rollback AHIO. Allows deleting DDB records",
    ContingentAuth: 1,
    PolicyTemplateReference: [
      {
        OwnerID: "aws-mobile-amplify-oncall",
        PolicyTemplateName: "AHIORollback",
      },
    ],
    Groups: ["aws-mobile-amplify-oncall"],
    FederationTimeOutMin: 60,
  };

  for (const account of accounts) {
    console.log(
      `Upserting role ${AHIORollbackRole.IAMRoleName} in account ${account.email}`
    );
    await upsertRole(account.accountId, AHIORollbackRole);
  }
}

main().then(console.log).catch(console.error);
