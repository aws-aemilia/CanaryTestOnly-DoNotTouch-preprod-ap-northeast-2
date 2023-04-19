import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  AmplifyAccount,
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../Isengard";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { CloudFront, DistributionConfig } from "@aws-sdk/client-cloudfront";
import {
  fetchDistribution,
  getDistributionsForApp,
} from "./distributionsUtils";
import confirm from "../utils/confirm";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { getCloudFormationOutput } from "./cfnUtils";
import {
  publishLambdaVersion,
  getOrCloneLambdaFunction,
} from "./lambdaFunctionUtils";
import {
  DistributionConfigUpdateContext,
  getDeployerConfiguration,
  getUpdateDistributionConfig,
  updateWarmingPoolDistributionType,
} from "./warmingPoolUtils";

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

const ROLLBACK_CLONE_FUNCTION_PREFIX = "RollbackClone";
const GATEWAY_ORIGIN_ID = "HostingGatewayALB";
const WARMING_POOL_CFN_STACK_NAME = "AemiliaWarmingPool";
const ORIGIN_ACCESS_IDENTITY_CFN_OUTPUT_NAME =
  "CloudFrontOriginAccessIdentityName";

const DEV_USER = process.env.USER;

const main = async () => {
  const args = (await yargs(hideBin(process.argv))
    .usage(
      `
      Rollback the given distribution from the Hosting Gateway to Lambda@Edge.

      This operation is meant to rollback distributions to use the Lambda@Edge instead of the Hosting Gateway. This is not a full-blown
      rollback mechanism - i.e., it is not going to rollback all distributions in the given region. Instead, it will only rollback the
      distribution provided as input to the script. The motivation behind this is to ensure that we only rollback on a case-by-case basis as and
      when we identify customers who are running into issues with the Hosting Gateway.
      
      Usage:
      brazil-build hostingGatewayRollback -- --appId=d1an8ahs5a8pgc --distributionId=E3ESP9CYKWPGVD --stage=test --region=us-west-2 --devAccountId=357128036178
      brazil-build hostingGatewayRollback -- --appId=d1an8ahs5a8pgc --distributionId=E3ESP9CYKWPGVD --stage=beta --region=us-west-2
      `
    )
    .option("stage", {
      describe: "test, beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "i.e. d1an8ahs5a8pgc",
      type: "string",
      demandOption: true,
    })
    .option("distributionId", {
      describe: "i.e. E3ESP9CYKWPGVD",
      type: "string",
      demandOption: true,
    })
    .option("devAccountId", {
      describe:
        "The account Id for your dev account. Use this option if you want to run this script against the 'test' stage a.k.a your local stack",
      type: "string",
      demandOption: false,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv) as GatewayRollbackScriptInput;

  const { region, stage, appId, distributionId, devAccountId, ticket } = args;

  process.env.ISENGARD_SIM = ticket;

  let account: AmplifyAccount;

  if (devAccountId) {
    account = {
      accountId: devAccountId,
      region,
      stage,
    } as AmplifyAccount;
  } else {
    account = await controlPlaneAccount(stage, region);
  }

  console.info("Initializing credentials and clients...");

  const { accountId } = account;
  const credentials = getIsengardCredentialsProvider(
    accountId,
    "OncallOperator"
  );

  const lambdaClient = new LambdaClient({
    credentials,
    // Lambda@Edge should always be in IAD
    region: "us-east-1",
    maxAttempts: 5,
  });

  const dynamoDBClient = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region,
      credentials,
    })
  );

  const cloudFrontClient = new CloudFront({
    region,
    credentials,
  });

  const cloudFormationClient = new CloudFormationClient({
    region,
    credentials,
  });

  console.info("Initialized credentials and clients.");

  const scriptClients = {
    lambdaClient,
    dynamoDBClient,
    cloudFrontClient,
    cloudFormationClient,
  };

  const rollbackdata = await generateDistributionConfigForMigration(
    args,
    scriptClients
  );
  const {
    eTag,
    distributionConfig,
    originRequestCloneFunctionArn,
    originResponseCloneFunctionArn,
    originAccessIdentity,
  } = rollbackdata;

  console.info(
    "Updating Distribution with the following DistributionConfig",
    JSON.stringify(distributionConfig, undefined, 2)
  );

  if (
    await confirm(
      "Do you want to update the distribution with the above config and switch the WarmingPool DistributionType back to 'LAMBDA_AT_EDGE'?"
    )
  ) {
    await updateDistribution(
      cloudFrontClient,
      lambdaClient,
      distributionId,
      eTag,
      distributionConfig,
      {
        appId,
        stage,
        region,
        originAccessIdentity,
        originRequestFunctionArn: originRequestCloneFunctionArn,
        originResponseFunctionArn: originResponseCloneFunctionArn,
        devUser: DEV_USER,
      }
    );

    await updateWarmingPoolDistributionType(
      stage,
      region,
      appId,
      "LAMBDA_AT_EDGE",
      dynamoDBClient
    );
    console.info(
      `Updated WarmingPool DistribtuionType for ${appId} to 'LAMBDA_AT_EDGE'...`
    );

    console.info("Successfully rolled back the distribution", distributionId);
  }
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
 * This function performs all the steps necessary to prepare the RollbackData.
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
      stage === "test" ? `sam-dev-${DEV_USER}-` : ""
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
    devUser: DEV_USER,
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
const validateAndGetGatewayDistribution = async (
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

  const defaultCacheBehavior = distributionConfig.DefaultCacheBehavior;

  if (!defaultCacheBehavior) {
    throw new Error(`DefaultCacheBehavior not found for Gateway distribution`);
  }

  const { TargetOriginId } = defaultCacheBehavior;

  if (TargetOriginId !== GATEWAY_ORIGIN_ID) {
    throw new Error(
      `Invalid distribution provided for rollback. Not a Gateway distribution`
    );
  }

  return {
    eTag,
    distributionConfig,
  };
};

/**
 * Clones the given Lambda@Edge origin functions and publishes the intended version of the clones.
 *
 * @param {string} clonePrefix - A prefix for the function name of the cloned function
 * @param {string} cloneVersion - The intended version of the cloned function
 * @param {string} originRequestFunctionArn - Function ARN for the OriginRequest function to clone from
 * @param {string} originResponseFunctionArn - Function ARN for the OriginResponse function to clone from
 * @param {LambdaClient} lambdaClient - The AWS Lambda client
 * @return {*}  {Promise<[string, string] - A tuple containing the ARNs of the cloned functions
 */
const getOrCloneOriginFunctions = async (
  clonePrefix: string,
  originRequestFunctionArn: string,
  originResponseFunctionArn: string,
  lambdaClient: LambdaClient
): Promise<{
  originRequestCloneFunctionArn: string;
  originResponseCloneFunctionArn: string;
}> => {
  console.info("Creating initial clones if needed...");

  const originRequestCloneFunctionArn = await getOrCloneLambdaFunction(
    originRequestFunctionArn,
    `${clonePrefix}${LambdaEdgeFunctionType.OriginRequest}`,
    lambdaClient
  );
  const originResponseCloneFunctionArn = await getOrCloneLambdaFunction(
    originResponseFunctionArn,
    `${clonePrefix}${LambdaEdgeFunctionType.OriginResponse}`,
    lambdaClient
  );

  console.info("Initial clones are now available.");

  return { originRequestCloneFunctionArn, originResponseCloneFunctionArn };
};

main().then(console.log).catch(console.error);
