import yargs from "yargs";
import {
  AmplifyAccount,
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../commons/Isengard";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import {
  NotGatewayDistribution,
  generateDistributionConfigForMigration,
  getDistributionsToRollback,
  updateDistribution,
} from "./distributionsUtils";
import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import sleep from "../../commons/utils/sleep";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { StandardRetryStrategy } from "@aws-sdk/middleware-retry";
import fs from "fs";
import { updateWarmingPoolDistributionType } from "./warmingPoolUtils";

const logger = pino(pinoPretty());
const distributionsRolledBack: Map<string, string[]> = new Map();
const DEV_USER = process.env.USER;
const CLOUD_FRONT_TPS = 0.3;
const CLOUD_FRONT_API_RATE_MS = (1.0 / CLOUD_FRONT_TPS) * 1000.0 * 1.1; // 10% buffer to account for our other service calls to cloudfront.
const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Rollback a region's Hosting Gateway Distributions.

      # Usage
      npx ts-node hostingGatewayRegionRollback.ts --stage test --region us-west-2 --devAccountId 123456789 --ticket P123456789

      # Usage
      npx ts-node hostingGatewayRegionRollback.ts --stage prod --region us-west-2 --ticket P123456789
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
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
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, devAccountId, ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  let account: AmplifyAccount;

  if (devAccountId) {
    account = {
      accountId: devAccountId,
      region,
      stage,
    } as AmplifyAccount;
  } else {
    account = await controlPlaneAccount(stage as Stage, region as Region);
  }

  logger.info("Initializing credentials and clients...");

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

  const dbclient = new DynamoDBClient({
    region,
    credentials,
  });

  const dynamoDBClient = DynamoDBDocumentClient.from(dbclient);
  const cloudFrontClient = new CloudFront({
    region,
    credentials,
    retryStrategy: new StandardRetryStrategy(() => Promise.resolve(5), {
      retryDecider: (error) => {
        // Check if the error is a 5xx or a ThrottlingException
        if (
          error.name.includes("Throttling") ||
          (error.$metadata &&
            error.$metadata.httpStatusCode &&
            error.$metadata.httpStatusCode >= 500)
        ) {
          return true;
        }
        return false;
      },
    }),
  });

  const cloudFormationClient = new CloudFormationClient({
    region,
    credentials,
  });

  logger.info("Initialized credentials and clients.");

  logger.info("Gathering distributions to be rolled back...");

  const distributionsToRollback = await getDistributionsToRollback(
    dbclient,
    dynamoDBClient,
    cloudFrontClient,
    account.stage,
    account.region
  );
  console.log(distributionsToRollback);
  writeDistributionDataToDisk(distributionsToRollback, "distributionsToRollback");

  for (const appId of distributionsToRollback.keys()) {
    logger.info(
      `App ${appId} has ${
        (distributionsToRollback.get(appId) || []).length
      } linked distributions.`
    );
    for (const distributionId of distributionsToRollback.get(appId) || []) {
      const scriptInput = {
        stage: stage as Stage,
        region: region as Region,
        appId,
        distributionId,
      };
      const scriptClients = {
        lambdaClient,
        dynamoDBClient,
        cloudFrontClient,
        cloudFormationClient,
      };

      let rollbackdata;
      try {
        rollbackdata = await generateDistributionConfigForMigration(
          scriptInput,
          scriptClients
        );
      } catch (e) {
        if (e instanceof NotGatewayDistribution) {
          logger.info(
            "The distribution for this app has already been rolled back. skipping..."
          );
          continue;
        }
        throw e;
      }

      const {
        eTag,
        distributionConfig,
        originRequestCloneFunctionArn,
        originResponseCloneFunctionArn,
        originAccessIdentity,
      } = rollbackdata;
      logger.info(
        `Updating distribution ${distributionId} for app ${appId}...`
      );
      await updateDistribution(
        cloudFrontClient,
        lambdaClient,
        distributionId,
        eTag,
        distributionConfig,
        {
          appId,
          stage: stage as Stage,
          region: region as Region,
          originAccessIdentity,
          originRequestFunctionArn: originRequestCloneFunctionArn,
          originResponseFunctionArn: originResponseCloneFunctionArn,
          devUser: DEV_USER,
        }
      );
      const distributions = distributionsRolledBack.get(appId) || [];
      distributions.push(distributionId);
      distributionsRolledBack.set(appId, distributions);

      logger.info(
        `Initiated UpdateDistribution, sleeping ${(
          CLOUD_FRONT_API_RATE_MS / 1000.0
        ).toFixed(2)}s to avoid cloudfront throttling...`
      );
      await sleep(CLOUD_FRONT_API_RATE_MS);
    }

    await updateWarmingPoolDistributionType(
      stage as Stage,
      region as Region,
      appId,
      "LAMBDA_AT_EDGE",
      dynamoDBClient
    );

    logger.info(
      `Updated WarmingPool DistribtuionType for ${appId} to 'LAMBDA_AT_EDGE'...`
    );
  }

  logger.info(`Migrated ${distributionsRolledBack.size} apps.`);
};

const writeDistributionDataToDisk = (
  distributionData: Map<string, string[]>,
  fileName: string
) => {
  let csv = "";

  // Add header row
  csv += "appId,DistributionId\n";

  // Loop through map entries and add rows
  for (const [appId, appDistributions] of distributionData.entries()) {
    for (const distributionId of appDistributions) {
      csv += `${appId},${distributionId}\n`;
    }
  }

  fs.writeFileSync(`${fileName}.csv`, csv);

  return csv;
};

main()
  .then()
  .catch((e) => {
    logger.error(e);
  }).finally(() => {
    writeDistributionDataToDisk(distributionsRolledBack, "distributionsRolledBack");
  });
