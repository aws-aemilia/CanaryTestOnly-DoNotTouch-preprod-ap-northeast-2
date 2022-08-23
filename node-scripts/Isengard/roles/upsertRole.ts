import { grantGroupPermission } from "@amzn/isengard/dist/src/permissions/queries";
import {
  addPolicyTemplateReferenceForIAMRole,
  attachIAMPolicyToIAMRole,
  createIAMRole,
  synchronizeIAMRolePolicyWithPolicyTemplate,
  updateIAMRole,
} from "@amzn/isengard";

export const withCatchOnErrorMsg = <T extends Array<any>, U>(
  errorMsgFragment: string,
  onSkipMsg: string,
  fn: (...args: T) => Promise<U>
) => {
  return async (...args: T): Promise<U | undefined> => {
    try {
      return await fn(...args);
    } catch (e) {
      if ((e as Error).message.includes(errorMsgFragment)) {
        console.log(onSkipMsg);
      } else {
        throw e;
      }
    }
  };
};
const createIAMRoleIfNotExists = withCatchOnErrorMsg(
  "Role with the same name for the same account already exists",
  "Role already exists. Skipping...",
  createIAMRole
);
const addPolicyTemplateReferenceForIAMRoleIfNotExists = withCatchOnErrorMsg(
  "Policy template reference already exists for IAM role",
  "Policy template reference already exists for IAM role. skipping...",
  addPolicyTemplateReferenceForIAMRole
);
const grantGroupPermissionIfNotExists = withCatchOnErrorMsg(
  "already exists",
  "Group Permission already exists. skipping...",
  grantGroupPermission
);
export type AmplifyRole = {
  IAMRoleName: string;
  Description: string;
  ContingentAuth: number;
  PolicyARNs?: string[];
  PolicyTemplateReference?: { PolicyTemplateName: string; OwnerID: string };
};
export const upsertRole = async (accountId: string, role: AmplifyRole) => {
  console.log(`Upserting role ${role.IAMRoleName} to account ${accountId}...`);
  const { IAMRoleName, PolicyTemplateReference, Description, ContingentAuth } = role;

  await createIAMRoleIfNotExists({
    AWSAccountID: accountId,
    IAMRoleName,
  });

  const updateIamRoleResponse = await updateIAMRole({
    AWSAccountID: accountId,
    IAMRole: {
      IAMRoleName,
      Description,
      ContingentAuth,
    },
  });

  console.log(updateIamRoleResponse);

  if (role.PolicyARNs) {
    for (const policyARN of role.PolicyARNs) {
      await attachIAMPolicyToIAMRole({
        AWSAccountID: accountId,
        IAMRoleName,
        PolicyARN: policyARN,
      });
    }
  }

  if (PolicyTemplateReference) {
    const { OwnerID, PolicyTemplateName } = PolicyTemplateReference;
    await addPolicyTemplateReferenceForIAMRoleIfNotExists({
      AWSAccountID: accountId,
      IAMRoleName,
      PolicyTemplateReference: {
        DoPropagatePolicyChanges: true,
        IsGroupOwned: true,
        OwnerID,
        PolicyTemplateName,
      },
    });

    await synchronizeIAMRolePolicyWithPolicyTemplate({
      AWSAccountID: accountId,
      IAMRoleName,
      IsGroupOwned: true,
      OwnerID,
      PolicyTemplateName,
    });
  }

  await grantGroupPermissionIfNotExists({
    AWSAccountID: accountId,
    Group: "aws-mobile-amplify-oncall",
    IAMRoleName: IAMRoleName,
  });
};
