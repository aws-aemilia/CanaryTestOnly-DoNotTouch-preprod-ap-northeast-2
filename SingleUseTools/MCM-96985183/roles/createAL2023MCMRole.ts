import {
  controlPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";
import { upsertRole } from "Commons/Isengard/roles/upsertRole";
import logger from "Commons/utils/logger";

/**
 * Script to create the AL2023MCMRole role
 */
async function main() {
  const accounts = await controlPlaneAccounts();
  await preflightCAZForAdministrativeIsengardCalls(accounts);

  for (const account of accounts) {
    logger.info(account, "Upserting role");
    await upsertRole(account.accountId, {
      IAMRoleName: "AL2023MCMRole",
      Description: "Role used to update apps with the AL2 build image URI",
      ContingentAuth: 1,
      PolicyTemplateReference: [
        {
          OwnerID: "aws-mobile-amplify-oncall",
          PolicyTemplateName: "AL2023MCMPolicyTemplate",
        },
      ],
      PosixGroups: ["aws-mobile-amplify-oncall"],
      FederationTimeOutMin: 60,
      PolicyARNs: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
    });
  }
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
