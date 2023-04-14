import logger from "./logger";
import {
  CloudFrontClient,
  DistributionConfig,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  UpdateDistributionCommandOutput,
  waitUntilDistributionDeployed,
} from "@aws-sdk/client-cloudfront";

/**
 * Function that describes the update to be applied to a distribution
 */
export type UpdateDistributionConfigFn = (
  distributionConfig: DistributionConfig
) => DistributionConfig;

export interface UpdateDistributionParameters {
  cloudFrontClient: CloudFrontClient;
  distributionId: string;
  updateDistributionConfigFn: UpdateDistributionConfigFn;
}

/**
 * Helper function to update a distribution.
 * It takes care of reading current DistributionConfig and sending the update request with the correct IFMatch ETag
 *
 * @param options
 * @param options.cloudFrontClient
 * @param options.distributionId
 * @param options.updateDistributionConfigFn - The actual update to be applied
 */
export async function updateDistribution({
  cloudFrontClient,
  distributionId,
  updateDistributionConfigFn,
}: UpdateDistributionParameters): Promise<UpdateDistributionCommandOutput> {
  const getDistributionConfigCommandOutput = await cloudFrontClient.send(
    new GetDistributionConfigCommand({ Id: distributionId })
  );

  const distributionConfig =
    getDistributionConfigCommandOutput.DistributionConfig!;
  const updatedDistributionConfig =
    updateDistributionConfigFn(distributionConfig);
  return await cloudFrontClient.send(
    new UpdateDistributionCommand({
      DistributionConfig: updatedDistributionConfig,
      Id: distributionId,
      IfMatch: getDistributionConfigCommandOutput.ETag,
    })
  );
}

export async function enableDistribution({
  cloudFrontClient,
  distributionId,
}: {
  cloudFrontClient: CloudFrontClient;
  distributionId: string;
}): Promise<UpdateDistributionCommandOutput> {
  return updateDistribution({
    cloudFrontClient,
    distributionId,
    updateDistributionConfigFn: (distributionConfig) => {
      distributionConfig.Enabled = true;
      return distributionConfig;
    },
  });
}

export async function disableDistribution({
  cloudFrontClient,
  distributionId,
}: {
  cloudFrontClient: CloudFrontClient;
  distributionId: string;
}): Promise<UpdateDistributionCommandOutput> {
  return updateDistribution({
    cloudFrontClient,
    distributionId,
    updateDistributionConfigFn: (distributionConfig) => {
      distributionConfig.Enabled = false;
      return distributionConfig;
    },
  });
}

export async function waitForDistributionUpdate(
  cloudFrontClient: CloudFrontClient,
  distributionId: string
): Promise<void> {
  logger.info(`Waiting for distribution ${distributionId} to be deployed...`);
  await waitUntilDistributionDeployed(
    {
      client: cloudFrontClient,
      maxWaitTime: 300,
      minDelay: 10,
      maxDelay: 20,
    },
    {
      Id: distributionId,
    }
  );
  logger.info(`Distribution ${distributionId} finished deploying`);
}
