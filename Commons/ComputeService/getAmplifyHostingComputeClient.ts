import {
  computeServiceControlPlaneAccount,
  getIsengardCredentialsProvider,
  Stage,
} from "Commons/Isengard";
import { RegionName } from "Commons/Isengard/types";
import { AmplifyHostingComputeClient } from "@amzn/awsamplifycomputeservice-client";
import { getComputeServiceEndpoint } from "Commons/ComputeService/get-endpoint";

export async function getAmplifyHostingComputeClient(
  stage: Stage,
  region: RegionName
): Promise<AmplifyHostingComputeClient> {
  const acc = await computeServiceControlPlaneAccount(stage, region);
  return new AmplifyHostingComputeClient({
    endpoint: getComputeServiceEndpoint(stage, region),
    region,
    credentials: getIsengardCredentialsProvider(
      acc.accountId,
      "OncallOperator"
    ),
  });
}
