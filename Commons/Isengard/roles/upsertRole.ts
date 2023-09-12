import {
  addPolicyTemplateReferenceForIAMRole,
  attachIAMPolicyToIAMRole,
  createIAMRole,
  deletePolicyTemplateReferenceForIAMRole,
  detachIAMPolicyFromIAMRole,
  getIAMRole,
  grantGroupPermission,
  grantUserPermission,
  listPermissionsForAWSAccount,
  revokeUserPermission,
  synchronizeIAMRolePolicyWithPolicyTemplate,
  updateIAMRole,
} from "@amzn/isengard";
import { revokeGroupPermission } from "../patchMissingIsengardMethods";

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

const grantUserPermissionIfNotExists = withCatchOnErrorMsg(
  "already exists",
  "User Permission already exists. skipping...",
  grantUserPermission
);

const revokeGroupPermissionIfExists = withCatchOnErrorMsg(
  "does not exist",
  "Group Permission does not exist. Nothing to revoke. Skipping...",
  revokeGroupPermission
);

const revokeUserPermissionIfExists = withCatchOnErrorMsg(
  "does not exist",
  "User Permission does not exist. Nothing to revoke. Skipping...",
  revokeUserPermission
);

type PermissionDiff = {
  groupsToAdd: string[];
  groupsToDelete: string[];
  usersToAdd: string[];
  usersToDelete: string[];
};

export const computePermissionDiff = async (
  accountId: string,
  IAMRoleName: string,
  Groups?: string[],
  Users?: string[]
): Promise<PermissionDiff> => {
  const permissionsForIAMRoles = await listPermissionsForAWSAccount(accountId);
  const foundRole = permissionsForIAMRoles.find(
    (p) => p.IAMRoleName === IAMRoleName
  );

  const permissions: PermissionDiff = {
    groupsToAdd: [],
    groupsToDelete: [],
    usersToAdd: [],
    usersToDelete: [],
  };

  if (!foundRole) {
    throw new Error(
      `Could not find IAM Role ${IAMRoleName} in account ${accountId}. Is your code to create roles correct?`
    );
  }

  const groups = Groups ?? [];
  for (const g of groups) {
    if (foundRole.GroupList.includes(g)) {
      continue;
    }
    permissions.groupsToAdd.push(g);
  }

  for (const g of foundRole.GroupList) {
    if (groups.includes(g)) {
      continue;
    }

    permissions.groupsToDelete.push(g);
  }

  if (!Users) {
    // Remove all users if User input is empty
    permissions.usersToDelete.push(...foundRole.UserList);
    permissions.usersToAdd = [];
  } else {
    // Add the requested users
    permissions.usersToAdd.push(...Users);
    // Remove the rest
    permissions.usersToDelete.push(
      ...foundRole.UserList.filter((u) => !Users.includes(u))
    );
  }

  return permissions;
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
    same: current.filter((c) => update.some((u) => comparisonFn(c, u))),
  };
};

export type AmplifyRole = {
  IAMRoleName: string;
  Description: string;
  ContingentAuth: number;
  Groups?: string[];
  PolicyARNs?: string[];
  PolicyTemplateReference?: {
    PolicyTemplateName: string;
    OwnerID: string;
    IsGroupOwned?: boolean;
  }[];
  FederationTimeOutMin: number;
  Users?: string[];
};

export const upsertRole = async (accountId: string, role: AmplifyRole) => {
  console.log(`Upserting role ${role.IAMRoleName} to account ${accountId}...`);
  const { IAMRoleName, Description, ContingentAuth, FederationTimeOutMin } =
    role;

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
      FederationTimeOutMin,
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
  }

  for (const isenPolicyToSync of [
    ...isenPolicyDiff.add,
    ...isenPolicyDiff.same,
  ]) {
    console.log(`syncing policy ${isenPolicyToSync.PolicyTemplateName}`);
    await synchronizeIAMRolePolicyWithPolicyTemplate({
      AWSAccountID: accountId,
      IAMRoleName,
      IsGroupOwned: isenPolicyToSync.IsGroupOwned ?? true,
      OwnerID: isenPolicyToSync.OwnerID,
      PolicyTemplateName: isenPolicyToSync.PolicyTemplateName,
    });
  }

  const permissionDiff = await computePermissionDiff(
    accountId,
    IAMRoleName,
    role.Groups,
    role.Users
  );

  for (const groupToDelete of permissionDiff.groupsToDelete) {
    await revokeGroupPermissionIfExists({
      AWSAccountID: accountId,
      Group: groupToDelete,
      IAMRoleName: IAMRoleName,
    });
  }

  for (const groupToAdd of permissionDiff.groupsToAdd) {
    await grantGroupPermissionIfNotExists({
      AWSAccountID: accountId,
      Group: groupToAdd,
      IAMRoleName: IAMRoleName,
    });
  }

  for (const userToAdd of permissionDiff.usersToAdd) {
    await grantUserPermissionIfNotExists({
      AWSAccountID: accountId,
      User: userToAdd,
      IAMRoleName: IAMRoleName,
    });
  }

  for (const userToDelete of permissionDiff.usersToDelete) {
    await revokeUserPermissionIfExists({
      AWSAccountID: accountId,
      User: userToDelete,
      IAMRoleName: IAMRoleName,
    });
  }
};
