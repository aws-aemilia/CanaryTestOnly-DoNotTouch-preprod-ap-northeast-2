import { createAWSAccount } from "@amzn/isengard";
import { Region, Stage } from "../types";
import { isOptInRegion, toRegionName } from "../../utils/regions";
import { getRolesForStage } from "../roles/standardRoles";
import { upsertRole } from "../roles/upsertRole";
import { AccountPurposeFn } from "./accountPuporses/types";
import { CreateAwsAccountRequest } from "@amzn/isengard/dist/src/accounts/types";
import { getAwsAccount } from "@amzn/isengard/dist/src/accounts/queries";

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

export const createAmplifyAccount = async (
  purposeFieldsFn: AccountPurposeFn,
  stage: Stage,
  region: Region,
  cellNumber?: number
) => {
  const request = {
    ...purposeFieldsFn(stage, region, cellNumber),
    AWSAccountClassification: {
      HasBusinessData: isProd(stage),
      HasCustomerData: isProd(stage),
      HasCustomerMetadata: isProd(stage),
      IsContingentAuthProtected: isProd(stage),
      IsProduction: isProd(stage),
    },
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
