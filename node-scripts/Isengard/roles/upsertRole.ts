import { grantGroupPermission } from "@amzn/isengard/dist/src/permissions/queries";
import {
  addPolicyTemplateReferenceForIAMRole,
  attachIAMPolicyToIAMRole,
  createIAMRole,
  listPermissionsByAWSAccount,
  synchronizeIAMRolePolicyWithPolicyTemplate,
  updateIAMRole,
} from "@amzn/isengard";
import { revokeGroupPermission } from "../patchMissingIsengardMethods";
import { getIAMRole } from "@amzn/isengard/dist/src/roles/queries";
import {
  deletePolicyTemplateReferenceForIAMRole,
  detachIAMPolicyFromIAMRole
} from "@amzn/isengard/dist/src/roles/mutations";

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
  "Role already exists. Skipping creation...",
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

const revokeGroupPermissionIfExists = withCatchOnErrorMsg(
  "does not exist",
  "Group Permission does not exist. Nothing to revoke. Skipping...",
  revokeGroupPermission
);

export const computeGroupDiff = async (
  accountId: string,
  IAMRoleName: string,
  Group?: string
): Promise<{ add: string[]; delete: string[] }> => {
  const permissionsForIAMRoles = await listPermissionsByAWSAccount(accountId);

  const foundRole = permissionsForIAMRoles.find(
    (p) => p.IAMRoleName === IAMRoleName
  );

  if (!foundRole) {
    throw new Error(
      `Could not find IAM Role ${IAMRoleName} in account ${accountId}. Is your code to create roles correct?`
    );
  }

  if (!Group) {
    return {
      delete: foundRole.GroupList,
      add: [],
    };
  }

  return {
    add: foundRole.GroupList.includes(Group) ? [] : [Group],
    delete: foundRole.GroupList.filter((g) => g !== Group),
  };
};

const arrayDiff = <T>(
  a: T[],
  b: T[],
  comparisonFn: (a: T, b: T) => boolean = (a, b) => a === b
): T[] => {
  return a.filter((aItem) => !b.some((bItem) => comparisonFn(aItem, bItem)));
};

const computeDiff = <T>(
  current: T[],
  update: T[],
  comparisonFn: (a: T, b: T) => boolean = (a, b) => a === b
) => {
  return {
    add: arrayDiff(update, current, comparisonFn),
    remove: arrayDiff(current, update, comparisonFn),
  };
};

export type AmplifyRole = {
  IAMRoleName: string;
  Description: string;
  ContingentAuth: number;
  Group?: string;
  PolicyARNs?: string[];
  PolicyTemplateReference?: { PolicyTemplateName: string; OwnerID: string }[];
};
export const upsertRole = async (accountId: string, role: AmplifyRole) => {
  console.log(`Upserting role ${role.IAMRoleName} to account ${accountId}...`);
  const { IAMRoleName, Description, ContingentAuth } = role;

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

  const getIAMRoleResponse = await getIAMRole({
    AWSAccountID: accountId,
    IAMRoleName: role.IAMRoleName,
  });

  const iamPolicyDiff = computeDiff(
    getIAMRoleResponse.AttachedPolicyList.map((p) => p.PolicyARN),
    role.PolicyARNs ?? []
  );

  for (const iamPolicyToAdd of iamPolicyDiff.add) {
    await attachIAMPolicyToIAMRole({
      AWSAccountID: accountId,
      IAMRoleName,
      PolicyARN: iamPolicyToAdd,
    });
  }

  for (const iamPolicyToRemove of iamPolicyDiff.remove) {
    await detachIAMPolicyFromIAMRole({
      AWSAccountID: accountId,
      IAMRoleName,
      PolicyARN: iamPolicyToRemove,
    });
  }

  const isenPolicyDiff = computeDiff(
    getIAMRoleResponse.IAMRole.PolicyTemplateReferenceList ?? [],
    role.PolicyTemplateReference ?? [],
    (a, b) =>
      a.PolicyTemplateName === b.PolicyTemplateName && a.OwnerID === b.OwnerID
  );

  for (const isenPolicyToRemove of isenPolicyDiff.remove) {
    await deletePolicyTemplateReferenceForIAMRole({
      AWSAccountID: accountId,
      IAMRoleName: role.IAMRoleName,
      IsGroupOwned: true,
      PolicyTemplateName: isenPolicyToRemove.PolicyTemplateName,
      PolicyTemplateOwnerID: isenPolicyToRemove.OwnerID,
    });
  }

  for (const isenPolicyToAdd of isenPolicyDiff.add) {
    const { OwnerID, PolicyTemplateName } = isenPolicyToAdd;
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

  const groupOwnersDiff = await computeGroupDiff(accountId, IAMRoleName, role.Group);

  for (const groupToDelete of groupOwnersDiff.delete) {
    await revokeGroupPermissionIfExists({
      AWSAccountID: accountId,
      Group: groupToDelete,
      IAMRoleName: IAMRoleName,
    });
  }

  for (const groupToAdd of groupOwnersDiff.add) {
    await grantGroupPermissionIfNotExists({
      AWSAccountID: accountId,
      Group: groupToAdd,
      IAMRoleName: IAMRoleName,
    });
  }
};
