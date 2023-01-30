import { doIsengardCall } from "@amzn/isengard";

/**
 * Some APIs are missing from the @amzn/isengard package.
 * This is a workaround to call those APIs. We should remove this once the APIs are added to the package.
 */

function getIsengardCall<T, V>(name: string) {
  return async (args: T) => {
    const response = await doIsengardCall(name, {
      params: args,
    });
    return response as V;
  };
}

export type RevokeGroupPermissionRequest = {
  AWSAccountID: string;
  IAMRoleName: string;
  Group: string;
};

export type RevokeGroupPermissionResponse = {
  message: string;
};

export const revokeGroupPermission = getIsengardCall<RevokeGroupPermissionRequest, RevokeGroupPermissionResponse>("RevokeGroupPermission");
