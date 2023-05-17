import {
  addPolicyTemplateReferenceForIAMRole,
  grantUserPermission,
  synchronizeIAMRolePolicyWithPolicyTemplate,
} from "@amzn/isengard";
import { controlPlaneAccounts } from "./Isengard";

const supportRoleName = "SupportOps";
const ownerID = "aws-mobile-amplify-oncall";
const policyTemplateName = "SupportOpsPolicy";

/**
 * This script was used to update the SupportOps role in all control plane prod accounts once.
 */
const main = async () => {
  const accounts = (await controlPlaneAccounts()).filter(
    (a) => a.stage === "prod"
  );

  for (const account of accounts) {
    console.log(
      `updating ${supportRoleName} role for account ${account.accountId} - ${account.email} `
    );

    try {
      const grantUserPermissionResponse = await grantUserPermission({
        AWSAccountID: account.accountId,
        IAMRoleName: supportRoleName,
        User: "dkkiuna",
      });

      console.log(grantUserPermissionResponse);
    } catch (e) {
      if (
          (e as Error).message ===
        "Unable to grant user permission: User Permission already exists"
      ) {
        console.log("User Permission already exists. skipping...");
      } else {
        throw e;
      }
    }

    try {
      const attachIAMPolicyToIAMRoleResponse =
        await addPolicyTemplateReferenceForIAMRole({
          AWSAccountID: account.accountId,
          IAMRoleName: supportRoleName,
          PolicyTemplateReference: {
            DoPropagatePolicyChanges: true,
            IsGroupOwned: true,
            OwnerID: ownerID,
            PolicyTemplateName: policyTemplateName,
          },
        });

      console.log(attachIAMPolicyToIAMRoleResponse);
    } catch (e) {
      if (
        (e as Error).message.includes(
          "Policy template reference already exists for IAM role"
        )
      ) {
        console.log(
          "Policy template reference already exists for IAM role. skipping..."
        );
      } else {
        throw e;
      }
    }

    const synchronizeIAMRolePolicyWithPolicyTemplateResponse = await synchronizeIAMRolePolicyWithPolicyTemplate({
      AWSAccountID: account.accountId,
      IAMRoleName: supportRoleName,
      IsGroupOwned: true,
      OwnerID: ownerID,
      PolicyTemplateName: policyTemplateName,
    });

    console.log(synchronizeIAMRolePolicyWithPolicyTemplateResponse);
  }
};

main().then(console.log).catch(console.log);
