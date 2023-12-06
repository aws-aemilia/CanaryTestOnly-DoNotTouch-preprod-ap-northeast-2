import { toAirportCode } from "Commons/utils/regions";
import { isProd } from "Commons/utils/stages";
import { Region, Stage } from "../../types";
import { AccountPurposeFn } from "./types";

export const kinesisConsumerTestPurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region
) => {
  // our preprod accounts use "cnsmr" instead of "consumer"
  const prefix = stage === "preprod" ? "cnsmr" : "consumer";

  return {
    Email: `aws-amplify-kinesis-${prefix}-${stage}-${toAirportCode(
      region
    ).toLowerCase()}@amazon.com`,
    // Name must be less than 50 chars
    Name: `aws-amplify-kinesis-${prefix}-${stage}-${toAirportCode(
      region
    ).toLowerCase()}@amazon.com`,
    Description: `Amplify Hosting Kinesis Consumer ${stage} ${region} Account`,
    Group: `Amplify Kinesis Consumer/${stage}`,
    AWSAccountClassification: {
      IsProduction: isProd(stage),
      HasBusinessData: isProd(stage),
      HasCustomerData: false,
      HasCustomerMetadata: isProd(stage),
      IsContingentAuthProtected: isProd(stage),
    },
  };
};
