import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Stage, Region } from "../Isengard";
import { DistributionConfig, EventType, Origin, Origins } from "@aws-sdk/client-cloudfront";
import { isOptInRegion } from "../utils/regions";
import { originShieldMap } from "./originShieldUtils";

export interface DeployerConfiguration {
  requestReplicationLambdaArn?: string;
  responseReplicationLambdaArn?: string;
}

interface DistributionConfigUpdateContext {
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
export const updateDistributionConfig = (distributionConfig: DistributionConfig) => {
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
        devUser,
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
  devUser?: string,
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
