import { toAirportCode } from "Commons/utils/regions";
import { Region, Stage } from "../../types";
import { capitalize } from "../createAmplifyAccount";
import { AccountPurposeFn } from "./types";

export const aesIntegrationTestPurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => ({
  Email: `aws-mobile-amplify+aes-integ-tst-${stage}-${toAirportCode(
    region
  ).toLowerCase()}@amazon.com`,
  // Name must be less than 50 chars
  Name: `aes-integ-test-${stage}-${toAirportCode(
    region
  ).toLowerCase()}@amazon.com`,
  Description: `Amplify Hosting AES Integration Test - ${stage} - ${region}`,
  Group: `Amplify/IntegrationTest/AES/${capitalize(stage)}`,
  AWSAccountClassification: {
    IsProduction: false,
    HasBusinessData: false,
    HasCustomerData: false,
    HasCustomerMetadata: false,
    IsContingentAuthProtected: false,
  },
});
