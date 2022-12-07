import { getAWSAccountClassification } from "@amzn/isengard/dist/src/accounts/queries";
import { getIAMRole } from "@amzn/isengard/dist/src/roles/queries";
import { getContingentAuthorizationToken, RiskLevel } from "@amzn/isengard";
import { memoizeWith } from "ramda";
import { Justification } from "@amzn/isengard/dist/src/contingent-authorization/types";
const prompt = require('prompt-sync')();

const getCAZJustification = (): Justification => {
  let { ISENGARD_MCM, ISENGARD_REVIEW_ID, ISENGARD_SIM } = process.env;

  if (!(ISENGARD_MCM || ISENGARD_REVIEW_ID || ISENGARD_SIM)) {
    console.log("No Contingent Authorization justification found among environment variables (ISENGARD_MCM, ISENGARD_REVIEW_ID, ISENGARD_SIM).")
    const cazType: string = prompt("Enter the justification type that you'll provide [sim, mcm, review, cancel]: ").toLowerCase();

    switch (cazType) {
      case "sim":
        ISENGARD_SIM = prompt("Enter the SIM ticket ID or link: ");
        process.env["ISENGARD_SIM"] = ISENGARD_SIM;
        break;
      case "mcm":
        ISENGARD_MCM = prompt("Enter the MCM ID or link: ");
        process.env["ISENGARD_MCM"] = ISENGARD_MCM;
        break;
      case "review":
        ISENGARD_REVIEW_ID = prompt("Enter the Consensus review ID or link: ")
        process.env["ISENGARD_REVIEW_ID"] = ISENGARD_REVIEW_ID;
        break;
      case "cancel":
        break;
      default:
        console.error("Invalid Contingent Authorization justification type.");
        break;
    }
  }

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
    `Failed to get Isengard credentials due to missing Contingent Authorization justification. Provide justification when prompted, or by setting one of the environment variables (ISENGARD_MCM, ISENGARD_REVIEW_ID, ISENGARD_SIM).`
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
        Justifications: [getCAZJustification()],
      })
    ).ContingentAuthorizationToken;
  }
);
