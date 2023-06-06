import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommandOutput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Stage, Region } from "../../commons/Isengard";
import {
  DistributionConfig,
  EventType,
  Origin,
  Origins,
} from "@aws-sdk/client-cloudfront";
import { isOptInRegion } from "../../commons/utils/regions";
import { originShieldMap } from "./originShieldUtils";

export interface WarmingPoolDistribution {
  distributionId: string;
  resourceId: string;
  claimStatus: string;
  distributionType: string;
}
export interface DeployerConfiguration {
  requestReplicationLambdaArn?: string;
  responseReplicationLambdaArn?: string;
}

export interface DistributionConfigUpdateContext {
  appId: string;
  originRequestFunctionArn: string;
  originResponseFunctionArn: string;
  originAccessIdentity: string;
  stage: Stage;
  region: Region;
  devUser?: string;
}

export const getDeployerConfiguration = async (
  stage: Stage,
  region: Region,
  dynamoDBClient: DynamoDBDocumentClient
): Promise<DeployerConfiguration> => {
  const tableName = `${stage}-${region}-WarmingPoolConfiguration`;

  const getCommand = new GetCommand({
    TableName: tableName,
    ProjectionExpression:
      "requestReplicationLambdaArn,responseReplicationLambdaArn",
    Key: {
      configurationName: "DeployerConfiguration",
    },
  });

  const result = await dynamoDBClient.send(getCommand);

  const { Item: deployerConfiguration } = result;

  if (!deployerConfiguration) {
    throw new Error(
      "DeployerConfiguration not found in the account - Unable to determine Lambda@Edge blueprint to clone from"
    );
  }

  return deployerConfiguration as DeployerConfiguration;
};

/**
 * Updates the given DistributionConfig to a Lambda@Edge DistributionConfig
 *
 * @param {DistributionConfig} distributionConfig
 * @return {*}
 */
export const getUpdateDistributionConfig = (
  distributionConfig: DistributionConfig
) => {
  return {
    with: ({
      appId,
      originRequestFunctionArn,
      originResponseFunctionArn,
      originAccessIdentity,
      stage,
      region,
      devUser,
    }: DistributionConfigUpdateContext) => {
      const defaultCacheBehavior = distributionConfig.DefaultCacheBehavior;

      if (!defaultCacheBehavior) {
        throw new Error(
          `DefaultCacheBehavior not found for Gateway distribution`
        );
      }

      defaultCacheBehavior.TargetOriginId = appId;
      defaultCacheBehavior.LambdaFunctionAssociations = {
        Quantity: 2,
        Items: [
          {
            EventType: EventType.origin_request,
            LambdaFunctionARN: originRequestFunctionArn,
          },
          {
            EventType: EventType.origin_response,
            LambdaFunctionARN: originResponseFunctionArn,
          },
        ],
      };

      distributionConfig.Origins = getLambdaEdgeDistributionOrigin(
        appId,
        originAccessIdentity,
        stage,
        region,
        devUser
      );

      return distributionConfig;
    },
  };
};

/**
 * Returns the CloudFront Origin for the Lambda@Edge distribution using Warming Pool defaults.
 *
 * @param {string} appId The App ID to rollback
 * @param {string} originAccessIdentity The OAI that should be associated with the Origin
 * @param {Stage} stage i.e. test, beta, gamma, prod
 * @param {Region} region i.e. us-east-1, us-west-2
 * @return {*}  {Origins} The CloudFront `Origins` object
 */
export const getLambdaEdgeDistributionOrigin = (
  appId: string,
  originAccessIdentity: string,
  stage: Stage,
  region: Region,
  devUser?: string
): Origins => {
  const hostingBucket = `aws-amplify-${stage}-${region}${
    stage === "test" ? devUser : ""
  }-website-hosting`;
  const s3UrlSuffix = isOptInRegion(region)
    ? `s3.${region}.amazonaws.com`
    : `s3.amazonaws.com`;
  const origin: Origin = {
    DomainName: `${hostingBucket}.${s3UrlSuffix}`,
    Id: appId,
    S3OriginConfig: {
      OriginAccessIdentity: `origin-access-identity/cloudfront/${originAccessIdentity}`,
    },
    OriginPath: `/${appId}`,
    OriginShield: {
      Enabled: true,
      OriginShieldRegion: originShieldMap[region],
    },
    CustomHeaders: {
      Quantity: 0,
    },
  };

  const origins: Origins = {
    Items: [origin],
    Quantity: 1,
  };

  return origins;
};

/**
 * Updates the DistributionType field for the resourceId in the warming pool table
 *
 * @param {Stage} stage stage
 * @param {Region} region region
 * @param {string} resourceId the appid (i.e. d123456789)
 * @param {"LAMBDA_AT_EDGE" | "GATEWAY"} distributionType gateway or lambda@edge
 * @param {DynamoDBDocumentClient} dynamoDBClient
 * @return {Promise<void>}
 */
export const updateWarmingPoolDistributionType = async (
  stage: Stage,
  region: Region,
  resourceId: string,
  distributionType: "LAMBDA_AT_EDGE" | "GATEWAY",
  dynamoDBClient: DynamoDBDocumentClient
) => {
  await dynamoDBClient.send(
    new UpdateCommand({
      TableName: `${stage}-${region}-WarmFrontEndResources`,
      Key: {
        resourceId,
      },
      UpdateExpression: "SET distributionType = :dt",
      ExpressionAttributeValues: {
        ":dt": distributionType,
      },
    })
  );
};

/**
 * Formats the QueryCommandOutput into a WarmingPoolDistribution array
 *
 * @param {QueryCommandOutput} page a page of query results from WarmingPool Table.
 * @return {WarmingPoolDistribution[]}
 */
export const convertToWarmingPoolDistributionFormat = (page: QueryCommandOutput) => {
  if (!page.Items) {
    return [];
  }

  if (page.Items.length === 0) {
    return [];
  }

  const wpDistributions: WarmingPoolDistribution[] = [];
  for (const item of page.Items) {
    if (
      item &&
      item.distributionId.S &&
      item.resourceId.S &&
      item.claimStatus.S &&
      item.distributionType.S
    ) {
      const wpDistro: WarmingPoolDistribution = {
        distributionId: item.distributionId.S,
        resourceId: item.resourceId.S,
        claimStatus: item.claimStatus.S,
        distributionType: item.distributionType.S,
      };
      wpDistributions.push(wpDistro);
    }
  }

  return wpDistributions;
};
