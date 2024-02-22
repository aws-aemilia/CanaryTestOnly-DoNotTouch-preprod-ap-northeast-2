import { toAirportCode } from "Commons/utils/regions";
import { isProd } from "Commons/utils/stages";
import { Region, Stage } from "../../types";
import { AccountPurposeFn } from "./types";

export const cfnRegistryPurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => ({
  Email: `aws-amplify+cfn+${stage}-${region.replace(/-/g, "")}@amazon.com`,
  // Name must be less than 50 chars
  Name: `aws-amplify+cfn+${stage}-${region.replace(/-/g, "")}`,
  Description: ` cfn-registry type account for ${region}-${stage}`,
  Group: `AWS-Amplify/cfn-registry`,
  AWSAccountClassification: {
    IsProduction: isProd(stage),
    HasBusinessData: false,
    HasCustomerData: isProd(stage),
    HasCustomerMetadata: isProd(stage),
    IsContingentAuthProtected: isProd(stage),
  },
});
