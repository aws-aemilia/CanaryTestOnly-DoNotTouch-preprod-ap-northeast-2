import { toAirportCode } from "Commons/utils/regions";
import { isProd } from "Commons/utils/stages";
import { Region, Stage } from "../../types";
import { capitalize } from "../createAmplifyAccount";
import { AccountPurposeFn } from "./types";

export const dataPlanePurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => ({
  Email: `aws-mobile-amplify+dataplane-${stage}-${toAirportCode(
    region
  ).toLowerCase()}@amazon.com`,
  // Name must be less than 50 chars
  Name: `dataplane-${stage}-${toAirportCode(region).toLowerCase()}@amazon.com`,
  Description: `Amplify Hosting Data Plane - ${stage} - ${region}`,
  Group: `Amplify Data Plane/${capitalize(stage)}`,
  AWSAccountClassification: {
    IsProduction: isProd(stage),
    HasBusinessData: isProd(stage),
    HasCustomerData: isProd(stage),
    HasCustomerMetadata: isProd(stage),
    IsContingentAuthProtected: isProd(stage),
  },
});
