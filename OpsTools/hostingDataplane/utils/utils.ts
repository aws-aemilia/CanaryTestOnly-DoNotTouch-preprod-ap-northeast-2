import { toRegionName } from "../../../commons/utils/regions";

export const getDomainName = (
  stage: string,
  region: string
) => {
  const regionName = toRegionName(region);
  return `${stage}.${regionName}.gateway.amplify.aws.dev`;
};

export const HOSTED_ZONE_ID = "Z06330931XFXCBAZV8FES"; // gateway.amplify.aws.dev
