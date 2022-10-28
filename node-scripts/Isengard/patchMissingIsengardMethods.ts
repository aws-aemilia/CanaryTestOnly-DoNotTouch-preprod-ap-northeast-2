import { doIsengardCall } from "@amzn/isengard";

/**
 * Some APIs are missing from the @amzn/isengard package.
 * This is a workaround to call those APIs. We should remove this once the APIs are added to the package.
 */

export type RevokeGroupPermissionRequest = {
  AWSAccountID: string;
  IAMRoleName: string;
  Group: string;
};

export type RevokeGroupPermissionResponse = {
  message: string;
};

export const revokeGroupPermission = async (
  args: RevokeGroupPermissionRequest
) => {
  const response = await doIsengardCall("RevokeGroupPermission", {
    params: args,
  });
  console.log(response);
  return response as RevokeGroupPermissionResponse;
};

