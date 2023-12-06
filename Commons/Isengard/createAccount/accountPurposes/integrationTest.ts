import { toAirportCode } from "Commons/utils/regions";
import { isProd } from "Commons/utils/stages";
import { Region, Stage } from "../../types";
import { AccountPurposeFn } from "./types";

export const integrationTestPurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => ({
  Email: `aws-aemilia-integration-test-${toAirportCode(
    region
  ).toLowerCase()}-${stage}@amazon.com`,
  // Name must be less than 50 chars
  Name: `aws-aemilia-integration-test${toAirportCode(
    region
  ).toLowerCase()}-${stage}-@amazon.com`,
  Description: `AWS Amplify Console integration test account for ${region}-${stage}`,
  Group: `Amplify/IntegrationTest/${stage}`,
  AWSAccountClassification: {
    IsProduction: false,
    HasBusinessData: false,
    HasCustomerData: false,
    HasCustomerMetadata: false,
    IsContingentAuthProtected: false,
  },
});
