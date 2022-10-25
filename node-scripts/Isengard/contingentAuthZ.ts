import { getAWSAccountClassification } from "@amzn/isengard/dist/src/accounts/queries";
import { getIAMRole } from "@amzn/isengard/dist/src/roles/queries";
import { getContingentAuthorizationToken, RiskLevel } from "@amzn/isengard";
import { memoizeWith } from "ramda";
import { Justification } from "@amzn/isengard/dist/src/contingent-authorization/types";

const getCAZJustificationFromEnv = (): Justification => {
  const { ISENGARD_MCM, ISENGARD_REVIEW_ID, ISENGARD_SIM } = process.env;

  if (ISENGARD_SIM) {
    return { SIM: { Link: ISENGARD_SIM } };
  }

  if (ISENGARD_MCM) {
    return { MCM: { Link: ISENGARD_MCM } };
  }

  if (ISENGARD_REVIEW_ID) {
    return { Review: { ReviewId: ISENGARD_REVIEW_ID } };
  }

  throw new Error(
    `Failed to get Isengard credentials due to missing Contingent Authorization justification. Provide a justification via one of the environment variables: ISENGARD_MCM, ISENGARD_REVIEW_ID, or ISENGARD_SIM.`
  );
};

/**
 * Taken from https://code.amazon.com/packages/BenderLibIsengard/blobs/a8494f0efbec05349f301c6c24f7e97640cfdb9d/--/src/isengard/_cli/functions.py#L53
 */
export const isContingentAuthNeeded = async (
  accountId: string,
  role: string
): Promise<boolean> => {
  const classification = await getAWSAccountClassification({
    awsAccountID: accountId,
  });

  if (!classification.IsProduction) {
    return false;
  }

  const getIAMRoleResponse = await getIAMRole({
    AWSAccountID: accountId,
    IAMRoleName: role,
  });

  return (
    getIAMRoleResponse.IAMRole.RiskLevel !== RiskLevel.LOW &&
    (classification.HasCustomerData || classification.HasCustomerMetadata)
  );
};

/**
 * Returns a contingent authorization token for the given account.
 *
 * This function is memoized to avoid Isengard throttling. The same token can be used for all interactions with the same account.
 */
export const getCAZToken: (accountId: string) => Promise<string> = memoizeWith(
  String,
  async (accountId: string) => {
    return (
      await getContingentAuthorizationToken({
        AWSAccountID: accountId,
        Bypass: false,
        Justifications: [getCAZJustificationFromEnv()],
      })
    ).ContingentAuthorizationToken;
  }
);
