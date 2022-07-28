import { toRegionName } from "../../../utils/regions";

export const getDomainName = (
  stage: string,
  region: string,
  cellNumber: string | number
) => {
  const regionName = toRegionName(region);
  return `cell${cellNumber}.${regionName}.${stage}.computesvc-gateway.amplify.aws.dev`;
};

