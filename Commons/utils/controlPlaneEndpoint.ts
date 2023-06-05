import { toRegionName } from "./regions";
import { Region, Stage } from "../Isengard";

/**
 * Constructs the control plane endpoint for a given stage and region.
 * It doesn't work for personal environments.
 * 
 * @param stage i.e. Beta, Gamma, PreProd or Prod
 * @param region
 * @returns
 */
export const buildControlPlaneEndpoint = (stage: Stage, region: Region): string => {
  const regionName = toRegionName(region);
  if (stage === "prod") {
    return `https://amplify.${regionName}.amazonaws.com`;
  }

  if (
    stage === "gamma" &&
    regionName !== "us-west-2" &&
    regionName !== "us-east-1"
  ) {
    // Gamma is only in us-west-2 and us-east-1, so this must be preprod
    return `https://preprod.${region}.controlplane.amplify.aws.dev`;
  }

  return `https://${stage}.${region}.controlplane.amplify.aws.dev`;
};
