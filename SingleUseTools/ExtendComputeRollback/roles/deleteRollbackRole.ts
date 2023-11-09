import logger from "Commons/utils/logger";
import { idempotentDeleteIAMRole } from "Commons/Isengard/roles/upsertRole";
import {
  dataPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";

/**
 * One time use script to delete the ExtendComputeRollback role
 */
async function main() {
  const accounts = await dataPlaneAccounts();
  await preflightCAZForAdministrativeIsengardCalls(accounts);

  for (const account of accounts) {
    logger.info(account, "Deleting ExtendComputeRollback role");
    await idempotentDeleteIAMRole({
      AWSAccountID: account.accountId,
      IAMRoleName: "ExtendComputeRollback",
    });
  }
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
