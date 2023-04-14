import axios from "axios";
import logger from "../utils/logger";
import testApps from "./testApps";
import {
  updateDistribution,
  waitForDistributionUpdate,
} from "../utils/cloudfront";
import { CloudFormationOutputs, TestDistribution } from "./types";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../Isengard";
import {
  CloudFrontClient,
  DefaultCacheBehavior,
  DistributionConfig,
} from "@aws-sdk/client-cloudfront";

// These test distributions were created manually in our Beta account 033345365959
// just for this MCM. They are reused to test the new ALBs in all stages and regions.
const testDistribution1: TestDistribution = {
  distributionId: "E17O7FW30YABZN",
  domainId: "d1bgfm6bwelfeq",
};

const testDistribution2: TestDistribution = {
  distributionId: "E1EQ6YQC61698R",
  domainId: "d7bmbnh9z4gq",
};

export async function precheckALBs(
  stage: string,
  region: string,
  cfnOutputs: CloudFormationOutputs
) {
  const testAppId = testApps[stage][region];
  const betaAccount = await controlPlaneAccount("beta", "pdx");
  const cloudFrontClient = new CloudFrontClient({
    region: "us-east-1",
    credentials: getIsengardCredentialsProvider(
      betaAccount.accountId,
      "OncallOperator"
    ),
  });

  logger.info(
    {
      shard1: cfnOutputs.HostingGatewayALBShard1DNS,
      shard2: cfnOutputs.HostingGatewayALBShard2DNS,
    },
    "Updating test distributions to point to ALB shards"
  );

  // Update both test distributions to point them to new ALB shards.
  const promises: Promise<void>[] = [];

  promises.push(
    pointDistributionToALB(
      cloudFrontClient,
      testDistribution1,
      cfnOutputs.HostingGatewayALBShard1DNS,
      testAppId
    )
  );

  promises.push(
    pointDistributionToALB(
      cloudFrontClient,
      testDistribution2,
      cfnOutputs.HostingGatewayALBShard2DNS,
      testAppId
    )
  );

  await Promise.all(promises);

  // Ping the test distributions to make sure the ALBs are healthy.
  logger.info("Asserting ALB Shard 1 responds successfully");
  await assertSuccessfulRequest(testDistribution1, testAppId);
  logger.info("ALB shard 1 responded successfully, precheck passed");

  logger.info("Asserting ALB Shard 2 responds successfully");
  await assertSuccessfulRequest(testDistribution2, testAppId);
  logger.info("ALB shard 2 responded successfully, precheck passed");
  logger.info("All prechecks passed, ALBs are healthy");
}

async function assertSuccessfulRequest(
  testDistribution: TestDistribution,
  testAppId: string
) {
  const response = await axios.get(`https://${testDistribution.domainId}.cloudfront.net`, {
    method: "GET",
    headers: {
      Host: `main.${testAppId}.amplifyapp.com`,
    },
  });

  if (response.status !== 200) {
    logger.error("Response status is not 200");
    throw new Error("Precheck failed");
  }

  if (!response.data || response.data.length === 0) {
    logger.error("No response received from ALB");
    throw new Error("Precheck failed");
  }

  if (!response.data.includes("Create Next App")) {
    logger.error("Response does not contain expected text");
    throw new Error("Precheck failed");
  }
}

async function pointDistributionToALB(
  cloudFrontClient: CloudFrontClient,
  testDistribution: TestDistribution,
  albDNS: string,
  canaryAppId: string
) {
  const originId = "HostingGatewayALB";
  await updateDistribution({
    cloudFrontClient,
    distributionId: testDistribution.distributionId,
    updateDistributionConfigFn: (
      currentConfig: DistributionConfig
    ): DistributionConfig => {
      return {
        ...currentConfig,
        DefaultCacheBehavior: {
          ...(currentConfig.DefaultCacheBehavior as DefaultCacheBehavior),
          TargetOriginId: originId,
        },
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: originId,
              DomainName: albDNS,
              OriginPath: "",
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "https-only",
                OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
                OriginReadTimeout: 60,
                OriginKeepaliveTimeout: 60,
              },
              CustomHeaders: {
                Quantity: 1,
                Items: [
                  {
                    HeaderName: "x-amplify-app-id",
                    HeaderValue: canaryAppId,
                  },
                ],
              },
            },
          ],
        },
      };
    },
  });

  await waitForDistributionUpdate(
    cloudFrontClient,
    testDistribution.distributionId
  );
}
