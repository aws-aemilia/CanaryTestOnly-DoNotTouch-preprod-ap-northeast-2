import logger from "Commons/utils/logger";
import { idempotentDeleteIAMRole } from "Commons/Isengard/roles/upsertRole";
import {
  controlPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";

/**
 * Script to delete the AL2023MCMRole role
 */
async function main() {
  const accounts = await controlPlaneAccounts();
  await preflightCAZForAdministrativeIsengardCalls(accounts);

  for (const account of accounts) {
    logger.info(account, "Deleting AL2023MCMRole role");
    await idempotentDeleteIAMRole({
      AWSAccountID: account.accountId,
      IAMRoleName: "AL2023MCMRole",
    });
  }
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
