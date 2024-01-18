import {
  controlPlaneAccounts,
  preflightCAZForAdministrativeIsengardCalls,
} from "Commons/Isengard";
import { upsertRole } from "Commons/Isengard/roles/upsertRole";
import logger from "Commons/utils/logger";

/**
 * Script to create the ECRPutImageRole role
 */
async function main() {
  const accounts = await controlPlaneAccounts();
  await preflightCAZForAdministrativeIsengardCalls(accounts);

  for (const account of accounts) {
    logger.info(account, "Upserting role");
    await upsertRole(account.accountId, {
      IAMRoleName: "ECRPutImageRole",
      Description: "Role used to tag the aemilia-build-image image",
      ContingentAuth: 1,
      PolicyTemplateReference: [
        {
          OwnerID: "aws-mobile-amplify-oncall",
          PolicyTemplateName: "ECRPutImagePolicyTemplate",
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
