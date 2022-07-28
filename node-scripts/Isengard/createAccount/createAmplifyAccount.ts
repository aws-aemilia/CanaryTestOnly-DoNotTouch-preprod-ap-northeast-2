import { createAWSAccount } from "@amzn/isengard";
import { Region, Stage } from "../types";
import { isOptInRegion, toRegionName } from "../../utils/regions";
import {
  adminRole,
  oncallOperatorRole,
  readOnlyRole,
} from "../roles/standardRoles";
import { upsertRole } from "../roles/upsertRole";
import { AccountPurposeFn } from "./accountPuporses/types";

const PRIMARY_OWNER = "dcalaver";
const SECONDARY_OWNER = "snimakom";
const FINANCIAL_OWNER = "litwjaco";
const POSIX_GROUP = "aws-mobile-amplify-oncall";
const CTI = {
  Category: "AWS",
  Type: "Mobile",
  Item: "Amplify",
};

export const capitalize = (s: string) => s.replace(/^\w/, (c) => c.toUpperCase());
const isProd = (stage: Stage) => stage === "prod";

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

  console.log("Sending request to create Isengard account", request);
  console.log("Isengard Account creation takes about 1 minute, Please wait...");
  const createAwsAccountResponse = await createAWSAccount(request);
  console.log(createAwsAccountResponse);

  console.log("Creating default roles...");
  const defaultRoles = [oncallOperatorRole, adminRole, readOnlyRole];
  for (const defaultRole of defaultRoles) {
    await upsertRole(createAwsAccountResponse.AWSAccountID, defaultRole);
  }
};

