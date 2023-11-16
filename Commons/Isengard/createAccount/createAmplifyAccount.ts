import {
  createAWSAccount,
  CreateAwsAccountRequest,
  getAwsAccount,
} from "@amzn/isengard";
import { AccountPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/types";
import { isOptInRegion, toRegionName } from "../../utils/regions";
import { getRolesForStage } from "../roles/standardRoles";
import { upsertRole } from "../roles/upsertRole";
import { Region, Stage } from "../types";

const PRIMARY_OWNER = "dcalaver";
const SECONDARY_OWNER = "snimakom";
const FINANCIAL_OWNER = "litwjaco";
const POSIX_GROUP = "aws-mobile-amplify-oncall";
const CTI = {
  Category: "AWS",
  Type: "Mobile",
  Item: "Amplify",
};

export const capitalize = (s: string) =>
  s.replace(/^\w/, (c) => c.toUpperCase());
const isProd = (stage: Stage) => stage === "prod";

const getOrCreateAccount = async (
  request: CreateAwsAccountRequest
): Promise<string> => {
  try {
    const accountDetails = await getAwsAccount({ Email: request.Email });
    console.log("Account already exists");
    return accountDetails.AWSAccountID!;
  } catch (e) {
    if ((e as Error).message.includes("Account not found with email")) {
      console.log("Account does not exist yet. Creating it now.");
      console.log("Sending request to create Isengard account", request);
      console.log(
        "Isengard Account creation takes about 1 minute, Please wait..."
      );
      const response = await createAWSAccount(request);
      console.log(response);
      return response.AWSAccountID;
    }
    throw e;
  }
};

/**
 * Create an Isengard account. The recommended usage of this function is to bind the first two arguments before calling
 * it:
 *
 * `export const createComputeServiceControlPlaneAccount: CreateAccountFn =
 *   createAmplifyAccount.bind(undefined, computeServiceControlPlanePurposeFn, true);`
 *
 * @param purposeFieldsFn A function that, given a region and stage, returns the account's basic information
 * @param classifyAsProduction Whether to classify prod accounts (when specified in the stage parameter below) as
 * Isengard production accounts. If you are unsure, set this to false and then manually classify them as production
 * accounts in the Isengard Web UI.
 * @param stage The stage of the account
 * @param region The region of the account
 * @param cellNumber The cell number of the account
 */
export const createAmplifyAccount = async (
  purposeFieldsFn: AccountPurposeFn,
  classifyAsProduction: boolean,
  stage: Stage,
  region: Region,
  cellNumber?: number
) => {
  let request = {
    ...purposeFieldsFn(stage, region, cellNumber),
    IsPersonal: false,
    OptInRegion: isOptInRegion(region) ? toRegionName(region) : undefined,
    S3PublicAccessSettings: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
    FinancialOwner: FINANCIAL_OWNER,
    PrimaryOwner: PRIMARY_OWNER,
    SecondaryOwner: SECONDARY_OWNER,
    PosixGroupOwner: POSIX_GROUP,
    Category: CTI.Category,
    Type: CTI.Type,
    Item: CTI.Item,
  };

  const accountId = await getOrCreateAccount(request);

  console.log("Creating default roles...");
  const defaultRoles = Object.values(getRolesForStage(stage));
  for (const defaultRole of defaultRoles) {
    await upsertRole(accountId, defaultRole);
  }
};
