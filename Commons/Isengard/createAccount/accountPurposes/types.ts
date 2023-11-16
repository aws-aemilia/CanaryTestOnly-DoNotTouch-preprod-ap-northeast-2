import { CreateAwsAccountRequest } from "@amzn/isengard";
import { Region, Stage } from "../../types";

/**
 * Properties that are specific to the purpose of an Isengard account. Everything else is standard across all Amplify accounts
 */
export type CreateAwsAccountRequestAccountPurposeFields = Required<
  Pick<
    CreateAwsAccountRequest,
    "Name" | "Email" | "Description" | "Group" | "AWSAccountClassification"
  >
>;

export type AccountPurposeFn = (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => CreateAwsAccountRequestAccountPurposeFields;
