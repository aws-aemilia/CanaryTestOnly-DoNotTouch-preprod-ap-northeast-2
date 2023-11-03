import {
  dataPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";
import { idempotentDeleteIAMRole } from "Commons/Isengard/roles/upsertRole";

/**
 * One time use script to delete the AHIORollback role
 */
async function main() {
  const accounts = await dataPlaneAccounts();
  await preflightCAZForAdministrativeIsengardCalls(accounts);
  for (const account of accounts) {
    console.log(`Deleting AHIORollback role for account ${account.accountId}`);
    await idempotentDeleteIAMRole({
      AWSAccountID: account.accountId,
      IAMRoleName: "AHIORollback",
    });
  }
}

main().then(console.log).catch(console.error);
