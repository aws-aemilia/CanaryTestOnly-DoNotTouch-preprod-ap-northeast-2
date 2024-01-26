import { AmplifyAccount } from "../../Commons/Isengard";
import logger from "../../Commons/utils/logger";

import { getCloudFormationOutputs } from "../../Commons/utils/cloudFormation";
import { Route53Client } from "@aws-sdk/client-route-53";
import { getHostedZone } from "../../Commons/route53";

interface CloudFormationOutputs {
  HostingGatewayALBShard1DNS: string;
  HostingGatewayALBShard1HostedZoneId: string;
  HostingGatewayALBShard2DNS: string;
  HostingGatewayALBShard2HostedZoneId: string;
}

export const getGatewayHostedZone = async (
  route53Client: Route53Client,
  gatewayRootDomain: string
): Promise<string> => {
  const hostedZone = await getHostedZone(route53Client, gatewayRootDomain);
  if (!hostedZone) {
    throw new Error(`Could not find hosted zone for ${gatewayRootDomain}`);
  }
  return hostedZone.Id as string;
};

export const getAndValidateCFNOutputs = async (
  gatewayAccount: AmplifyAccount,
  stackName: string
): Promise<CloudFormationOutputs> => {
  logger.info("Fetching ALB configuration from CloudFormation");
  const outputs = await getCloudFormationOutputs({
    amplifyAccount: gatewayAccount,
    stackName: stackName,
    outputKeys: [
      "HostingGatewayALBShard1DNS",
      "HostingGatewayALBShard1HostedZoneId",
      "HostingGatewayALBShard2DNS",
      "HostingGatewayALBShard2HostedZoneId",
    ],
  });

  if (
    // Validate that all outputs are present and not empty
    isEmpty(outputs.HostingGatewayALBShard1DNS) ||
    isEmpty(outputs.HostingGatewayALBShard1HostedZoneId) ||
    isEmpty(outputs.HostingGatewayALBShard2DNS) ||
    isEmpty(outputs.HostingGatewayALBShard2HostedZoneId)
  ) {
    logger.error({ ...outputs });
    throw new Error("Could not find expected outputs from CloudFormation");
  }

  logger.info({ ...outputs }, "Found expected ALB configurations");
  return {
    HostingGatewayALBShard1DNS: outputs.HostingGatewayALBShard1DNS,
    HostingGatewayALBShard1HostedZoneId:
      outputs.HostingGatewayALBShard1HostedZoneId,
    HostingGatewayALBShard2DNS: outputs.HostingGatewayALBShard2DNS,
    HostingGatewayALBShard2HostedZoneId:
      outputs.HostingGatewayALBShard2HostedZoneId,
  };
};

function isEmpty(value: any): boolean {
  return !!value;
}
