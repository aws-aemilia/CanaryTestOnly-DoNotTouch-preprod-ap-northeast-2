import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { WarmResourcesDAO } from "Commons/dynamodb/tables/WarmResourcesDAO";
import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  StandardRoles,
} from "Commons/Isengard";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import confirm from "../../Commons/utils/confirm";
import {
  GatewayRollbackScriptInput,
  generateDistributionConfigForMigration,
  updateDistribution,
} from "./distributionsUtils";

const DEV_USER = process.env.USER;
const role = StandardRoles.OncallOperator;

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
      brazil-build hostingGatewayRollback -- --appId=d2w8as945uxwtu --distributionId=E2RYTTVOSQ8I3V --stage=prod --region=us-east-1
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
    .strict()
    .version(false)
    .help().argv) as GatewayRollbackScriptInput;

  let { region, stage, appId, distributionId, devAccountId } = args;
  region = toRegionName(region);

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

  await preflightCAZ({ accounts: account, role });
  const credentials = getIsengardCredentialsProvider(accountId, role);

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

  const warmResourcesDAO = new WarmResourcesDAO(stage, region, credentials);

  console.info("Initialized credentials and clients.");

  const scriptClients = {
    lambdaClient,
    dynamoDBClient,
    cloudFrontClient,
    cloudFormationClient,
  };

  const rollbackData = await generateDistributionConfigForMigration(
    args,
    scriptClients
  );
  const {
    eTag,
    distributionConfig,
    originRequestCloneFunctionArn,
    originResponseCloneFunctionArn,
    originAccessIdentity,
  } = rollbackData;

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

    await warmResourcesDAO.updateResourceDistType(appId, "LAMBDA_AT_EDGE");
    console.info(
      `Updated WarmingPool DistributionType for ${appId} to 'LAMBDA_AT_EDGE'...`
    );

    console.info("Successfully rolled back the distribution", distributionId);
  }
};

main().then(console.log).catch(console.error);
