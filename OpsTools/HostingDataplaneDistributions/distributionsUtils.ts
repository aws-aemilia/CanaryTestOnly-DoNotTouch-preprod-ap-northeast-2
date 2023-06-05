import { CloudFront, DistributionConfig } from "@aws-sdk/client-cloudfront";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  DynamoDBClient,
  paginateQuery,
  QueryCommandInput,
} from "@aws-sdk/client-dynamodb";
import {
  DistributionConfigUpdateContext,
  getDeployerConfiguration,
  getUpdateDistributionConfig,
  convertToWarmingPoolDistributionFormat,
} from "./warmingPoolUtils";
import { getCloudFormationOutput } from "./cfnUtils";
import { LambdaClient } from "@aws-sdk/client-lambda";
import {
  getOrCloneOriginFunctions,
  publishLambdaVersion,
} from "./lambdaFunctionUtils";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { Region, Stage } from "../../Commons/Isengard";

export class NotGatewayDistribution extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotGatewayDistribution";
  }
}
export interface GatewayRollbackScriptInput {
  stage: Stage;
  region: Region;
  appId: string;
  distributionId: string;
  devAccountId?: string;
  ticket?: string;
}

export interface GatewayRollbackScriptClients {
  lambdaClient: LambdaClient;
  dynamoDBClient: DynamoDBDocumentClient;
  cloudFrontClient: CloudFront;
  cloudFormationClient: CloudFormationClient;
}

export interface GatewayRollbackScriptOutput {
  eTag: string;
  distributionConfig: DistributionConfig;
  originRequestCloneFunctionArn: string;
  originResponseCloneFunctionArn: string;
  originAccessIdentity: string;
}
enum LambdaEdgeFunctionType {
  OriginRequest = "OriginRequest",
  OriginResponse = "OriginResponse",
}
export const GATEWAY_ORIGIN_ID = "HostingGatewayALB";
export const ORIGIN_ACCESS_IDENTITY_CFN_OUTPUT_NAME =
  "CloudFrontOriginAccessIdentityName";
export const WARMING_POOL_CFN_STACK_NAME = "AemiliaWarmingPool";
export const ROLLBACK_CLONE_FUNCTION_PREFIX = "RollbackClone";

export async function getDistributionsToRollback(
  dbclient: DynamoDBClient,
  dynamoDBClient: DynamoDBDocumentClient,
  cloudFrontClient: CloudFront,
  stage: string,
  region: string
): Promise<Map<string, string[]>> {
  const distributionsToRollback = new Map<string, string[]>();
  const queryCommandInput: QueryCommandInput = {
    TableName: `${stage}-${region}-WarmFrontEndResources`,
    IndexName: "claimStatus-distributionType-index",
    KeyConditionExpression: "#claimStatus = :claimStatus",

    ExpressionAttributeNames: {
      "#claimStatus": "claimStatus",
    },
    ExpressionAttributeValues: {
      ":claimStatus": {
        S: "CLAIMED",
      },
    },
    Limit: 1000,
  };
  for await (const page of paginateQuery(
    { client: dbclient },
    queryCommandInput
  )) {
    const warmingPoolDistributions = convertToWarmingPoolDistributionFormat(page);
    for (const warmingPoolDistribution of warmingPoolDistributions) {
      const appId = warmingPoolDistribution.resourceId;
      
      // save CLAIMED, GATEWAY distributions to rollback
      if (warmingPoolDistribution.distributionType === "GATEWAY") {
          const distributionsForApp = await getDistributionsForApp(
            dynamoDBClient,
            stage,
            region as Region,
            appId
          );
          for (const distributionId of distributionsForApp) {
            const distributions = distributionsToRollback.get(appId) || [];
            distributions.push(distributionId);
            distributionsToRollback.set(appId, distributions);
          }
      }
      // save CLAIMED, LAMBDA_AT_EDGE distributions that have at least one GATEWAY custom domain distribution
      else if (warmingPoolDistribution.distributionType === "LAMBDA_AT_EDGE") {
        const customDomainDistributions =
          await getCustomDomainDistributionsForApp(
            dynamoDBClient,
            stage,
            region,
            appId
          );
        if (customDomainDistributions.length > 0) {
          for (const customDomainDistributionId of customDomainDistributions) {
            // if any of these are Gateway distributions, add them to the list

              const { eTag, distributionConfig } = await fetchDistribution(
                cloudFrontClient,
                customDomainDistributionId
              );
              if (isGatewayDistribution(distributionConfig)) {
                console.log(`Found GATEWAY custom domain distributions for LAMBDA_AT_EDGE app ${appId}`)

                const distributions = distributionsToRollback.get(appId) || [];
                distributions.push(customDomainDistributionId);
                distributionsToRollback.set(appId, distributions);
              }

          }
        }
      }
    }
  }

  return distributionsToRollback;
}

export async function fetchDistribution(
  cloudfront: CloudFront,
  distributionId: string
): Promise<{
  eTag: string;
  distributionConfig: DistributionConfig;
}> {
  console.log("Fetching distribution", distributionId);
  const response = await cloudfront.getDistribution({
    Id: distributionId,
  });

  if (!response.Distribution || !response.ETag) {
    throw new Error(`"Distribution ${distributionId} not found"`);
  }

  if (!response.Distribution.DistributionConfig) {
    throw new Error(`"Distribution ${distributionId} not found"`);
  }

  return {
    eTag: response.ETag,
    distributionConfig: response.Distribution.DistributionConfig,
  };
}

export async function getCustomDomainDistributionsForApp(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string
): Promise<string[]> {
  const distributions: string[] = [];
  const domainsTableName = `${stage}-${region}-Domain`;
  console.log(`Looking for custom domain distributions for app: ${appId}`);
  const domains = await dynamodb.send(
    new QueryCommand({
      TableName: domainsTableName,
      KeyConditionExpression: "appId = :appId",
      ExpressionAttributeValues: {
        ":appId": appId,
      },
    })
  );

  if (domains.Items) {
    domains.Items.forEach(({ distributionId, domainName }) => {
      if (distributionId) {
        distributions.push(distributionId);
      }
    });
  }
  console.log(`Found ${distributions} custome domain distributions for app ${appId}`);

  return distributions;
}

export async function getDistributionsForApp(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string
): Promise<string[]> {
  const distributions = [];
  const appTableName = `${stage}-${region}-App`;
  console.log("Looking for app distributions");
  const app = await dynamodb.send(
    new GetCommand({
      TableName: appTableName,
      Key: {
        appId: appId,
      },
    })
  );

  if (!app.Item) {
    throw new Error(`AppId ${appId} not found in table ${appTableName}`);
  }

  if (app.Item.cloudFrontDistributionId) {
    console.log(
      "Found default distribution",
      app.Item.cloudFrontDistributionId
    );
    distributions.push(app.Item.cloudFrontDistributionId);
  }

  const customDomainDistributions = await getCustomDomainDistributionsForApp(
    dynamodb,
    stage,
    region,
    appId
  );
  if (customDomainDistributions.length > 0) {
    distributions.push(...customDomainDistributions);
  }

  return distributions;
}

/**
 * This function performs all the steps necessary to prepare the GatewayRollbackScriptOutput.
 *
 * @param {GatewayRollbackScriptInput} scriptInput The input data necessary to create the DistributionConfig
 * @param {GatewayRollbackScriptClients} scriptClients The AWS clients needed to fetch the data to prepare the DistributionConfig
 * @return {Promise<GatewayRollbackScriptOutput>} The data necessary to rollback the distribution
 */
export const generateDistributionConfigForMigration = async (
  scriptInput: GatewayRollbackScriptInput,
  scriptClients: GatewayRollbackScriptClients
) => {
  const { region, stage, appId, distributionId } = scriptInput;
  const {
    lambdaClient,
    dynamoDBClient,
    cloudFrontClient,
    cloudFormationClient,
  } = scriptClients;
  console.info(
    "Verifying ownership of the distributionId for the given appId..."
  );
  const distributionsForApp = await getDistributionsForApp(
    dynamoDBClient,
    stage,
    region,
    appId
  );
  if (!distributionsForApp.includes(distributionId)) {
    throw new Error(
      `Ownership Verification Faild: The given distributionId ${distributionId} does not belong to the appId ${appId}.`
    );
  }
  console.info("Verification successful.");

  console.info("Retrieving existing DistributionConfig...");

  const { eTag, distributionConfig } = await validateAndGetGatewayDistribution(
    distributionId,
    cloudFrontClient
  );

  console.info("Retrieved existing DistributionConfig.");
  console.info(
    "Retrieveing DeployerConfiguration to identify existing origin function ARNS..."
  );

  const deployerConfiguration = await getDeployerConfiguration(
    stage,
    region,
    dynamoDBClient
  );

  console.info("Retrieved DeployerConfiguration.");

  const {
    requestReplicationLambdaArn: originRequestFunctionArn,
    responseReplicationLambdaArn: originResponseFunctionArn,
  } = deployerConfiguration;

  if (!originRequestFunctionArn || !originResponseFunctionArn) {
    throw new Error(
      "DeployerConfiguration does not contain replication function ARNs"
    );
  }

  console.info(
    `OriginRequest function ARN to clone from: ${originRequestFunctionArn}`
  );
  console.info(
    `OriginResponse function ARN to clone from: ${originResponseFunctionArn}`
  );

  const { originRequestCloneFunctionArn, originResponseCloneFunctionArn } =
    await getOrCloneOriginFunctions(
      ROLLBACK_CLONE_FUNCTION_PREFIX,
      originRequestFunctionArn,
      originResponseFunctionArn,
      lambdaClient
    );

  console.info("Retrieving OAI from the Warming Pool CFN...");

  const originAccessIdentity = await getCloudFormationOutput(
    cloudFormationClient,
    `${
      stage === "test" ? `sam-dev-${process.env.USER}-` : ""
    }${WARMING_POOL_CFN_STACK_NAME}`,
    ORIGIN_ACCESS_IDENTITY_CFN_OUTPUT_NAME
  );

  if (!originAccessIdentity) {
    throw new Error(
      `Origin Access Identity was found in the Warming Pool stack`
    );
  }

  console.info("Retrieved OAI from the Warming Pool CFN.");

  const updatedDistributionConfig = getUpdateDistributionConfig(
    distributionConfig
  ).with({
    appId,
    originRequestFunctionArn: `${originRequestCloneFunctionArn}`,
    originResponseFunctionArn: `${originResponseCloneFunctionArn}`,
    originAccessIdentity,
    stage,
    region,
    devUser: process.env.USER,
  });

  return {
    eTag: eTag,
    distributionConfig: updatedDistributionConfig,
    originRequestCloneFunctionArn: originRequestCloneFunctionArn,
    originResponseCloneFunctionArn: originResponseCloneFunctionArn,
    originAccessIdentity: originAccessIdentity,
  };
};

/**
 * A recursive function that will attempt to update a distributino with the rollback config, but if it encounters the TooManyDistributionsWithSingleFunctionARN error,
 * it will publish a new version of the lambda and call itself again using the new version.
 *
 * @param {CloudFront} cloudFrontClient cloudfront client
 * @param {LambdaClient} lambdaClient lambda client
 * @param {string} distributionId the distributionId to update
 * @param {string} eTag etag of the distribution
 * @param {DistributionConfig} distributionConfig the distribution config to update the distribution with
 * @param {DistributionConfigUpdateContext} distributionConfigUpdateContext context for the distribution config update
 * @return {Promise<void>}
 */
export const updateDistribution = async (
  cloudFrontClient: CloudFront,
  lambdaClient: LambdaClient,
  distributionId: string,
  eTag: string,
  distributionConfig: DistributionConfig,
  distributionConfigUpdateContext: DistributionConfigUpdateContext
) => {
  const {
    appId,
    stage,
    region,
    originAccessIdentity,
    originRequestFunctionArn,
    originResponseFunctionArn,
    devUser,
  } = distributionConfigUpdateContext;

  try {
    await cloudFrontClient.updateDistribution({
      Id: distributionId,
      IfMatch: eTag,
      DistributionConfig: distributionConfig,
    });
    console.info("Updated distribution config.");
  } catch (e) {
    if ((e as Error).name === "TooManyDistributionsWithSingleFunctionARN") {
      console.info(
        "Detected TooManyDistributionsWithSingleFunctionARN. Publishing a new versions of the lambda functions and trying again..."
      );
      const newOriginRequestFunctionVersionArn = await publishLambdaVersion(
        `${ROLLBACK_CLONE_FUNCTION_PREFIX}${LambdaEdgeFunctionType.OriginRequest}`,
        lambdaClient
      );
      const newOriginResponseFunctionVersionArn = await publishLambdaVersion(
        `${ROLLBACK_CLONE_FUNCTION_PREFIX}${LambdaEdgeFunctionType.OriginResponse}`,
        lambdaClient
      );

      const updatedDistributionConfig = getUpdateDistributionConfig(
        distributionConfig
      ).with({
        appId,
        originRequestFunctionArn: `${newOriginRequestFunctionVersionArn}`,
        originResponseFunctionArn: `${newOriginResponseFunctionVersionArn}`,
        originAccessIdentity,
        stage,
        region,
        devUser,
      });

      await updateDistribution(
        cloudFrontClient,
        lambdaClient,
        distributionId,
        eTag,
        updatedDistributionConfig,
        {
          appId,
          originRequestFunctionArn: `${newOriginRequestFunctionVersionArn}`,
          originResponseFunctionArn: `${newOriginResponseFunctionVersionArn}`,
          originAccessIdentity,
          stage,
          region,
          devUser,
        }
      );
      return;
    }
    throw e;
  }
};

/**
 * Retrieves the Distribution for the given distributionId, but only if it is a valid Gateway distribution. Throws an error
 * if the distribution is not a valid Gateway distribution.
 *
 * @param {string} distributionId The Distribution ID
 * @param {CloudFront} cloudFrontClient The AWS CloudFront client
 * @return {*}  {Promise<{
 *   eTag: string,
 *   distributionConfig: DistributionConfig,
 * }>} An object containing the DistributionConfig and eTag of the found distribution
 */
export const validateAndGetGatewayDistribution = async (
  distributionId: string,
  cloudFrontClient: CloudFront
): Promise<{
  eTag: string;
  distributionConfig: DistributionConfig;
}> => {
  const { eTag, distributionConfig } = await fetchDistribution(
    cloudFrontClient,
    distributionId
  );

  if (!isGatewayDistribution(distributionConfig)) {
    throw new NotGatewayDistribution(
      `Invalid distribution provided for rollback. Not a Gateway distribution`
    );
  }
  
  return {
    eTag,
    distributionConfig,
  };
};

export const isGatewayDistribution = (
  distributionConfig: DistributionConfig
) => {
  const defaultCacheBehavior = distributionConfig.DefaultCacheBehavior;

  if (!defaultCacheBehavior) {
    throw new Error(`DefaultCacheBehavior not found for Gateway distribution`);
  }
  const { TargetOriginId } = defaultCacheBehavior;

  return TargetOriginId === GATEWAY_ORIGIN_ID;
};
