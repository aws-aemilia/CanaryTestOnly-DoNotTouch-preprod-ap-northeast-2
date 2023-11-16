import { toAirportCode } from "Commons/utils/regions";
import { isProd } from "Commons/utils/stages";
import { Region, Stage } from "../../types";
import { capitalize } from "../createAmplifyAccount";
import { AccountPurposeFn } from "./types";

export const computeServiceControlPlanePurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => ({
  Email: `aws-mobile-amplify+compute-service-${stage}-${toAirportCode(
    region
  ).toLowerCase()}@amazon.com`,
  // Name must be less than 50 chars
  Name: `compute-service-${stage}-${toAirportCode(
    region
  ).toLowerCase()}@amazon.com`,
  Description: `Amplify Compute Service Control Plane - ${capitalize(
    stage
  )} - ${toAirportCode(region).toUpperCase()}`,
  Group: `Amplify Compute Service/${capitalize(stage)}`,
  AWSAccountClassification: {
    IsProduction: isProd(stage),
    HasBusinessData: isProd(stage),
    HasCustomerData: isProd(stage),
    HasCustomerMetadata: isProd(stage),
    IsContingentAuthProtected: isProd(stage),
  },
});
