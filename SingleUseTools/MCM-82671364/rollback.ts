import {
  LambdaEdgeConfig,
  getDynamoDBDocumentClient,
  getJobIdsForBranchArn,
  getLambdaEdgeConfigForAppOrDomain,
} from "../../Commons/dynamodb";
import { createLogger } from "../../Commons/utils/logger";
import yargs from "yargs";
import {
  Region,
  Stage,
  getIsengardCredentialsProvider,
  computeServiceControlPlaneAccount,
  controlPlaneAccount,
} from "../../Commons/Isengard";
import path from "path";
import csv from "csvtojson";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  HeadObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { AmplifyHostingComputeClient } from "@amzn/awsamplifycomputeservice-client";
import {
  getComputeServiceEndpoint,
  startDeployment,
} from "../../Commons/ComputeService";
import { AppDAO } from "../../Commons/dynamodb/tables/AppDAO";
import { existsSync, mkdirSync } from "fs";
import { appendFile, writeFile } from "fs/promises";

interface ScriptInput {
  stage: Stage;
  region: Region;
  inputFile?: string;
  appId?: string;
}

interface AppInput {
  appId: string;
  region: Region;
  stage: Stage;
}

interface StaticAssetBranch {
  appId: string;
  branchName: string;
  activeJobId: string;
}

const logger = createLogger();

const main = async () => {
  const args = (await yargs(process.argv.slice(2))
    .usage(
      `Rollback script for MCM-82671364
 
      Running this script will manually deploy the artifacts.zip file in the Artifacts Bucket to the compute service for the affected apps.

      Usage:
      # For a single app
      npx ts-node rollback.ts --stage beta --region us-west-2 --app-id d1e2f3a4ghc

      # For a list of apps, first run the customerimpact.ts script like so:
      npx ts-node customerimpact.ts --stage beta --region us-west-2 --output-type apps

      # Use the generated output file as input to this script like so:
      npx ts-node rollback.ts --stage prod --region us-west-2 --input-file apps.csv

      # Example of apps.csv
      appId,region,stage
      dl41u6lnr8337,us-east-1,prod
      dozahly8dfb3n,us-east-1,prod
      `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("app-id", {
      alias: "appId",
      describe:
        "The Amplify App ID. If provided, the rollback will only be applied against this app.",
      type: "string",
    })
    .option("input-file", {
      alias: "inputFile",
      describe: "The name of the input file",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv) as ScriptInput;

  const { stage, region, appId, inputFile } = args;

  logger.info(`Running with stage: ${stage} and region: ${region}`);

  process.env.ISENGARD_MCM = "MCM-82671364";

  if (!inputFile && !appId) {
    throw new Error(`Please provide either an appId or an input file`);
  }

  const appsToRollback: AppInput[] = [];

  if (inputFile) {
    const input = path.join(inputFile);

    logger.warn(`Looking up input file: ${input}`);

    const apps: AppInput[] = await csv().fromFile(input);
    appsToRollback.push(...apps);
  } else if (appId) {
    appsToRollback.push({
      appId,
      region: region,
      stage: stage,
    });
  }

  const apps = appsToRollback.filter(
    (app) => app.region === region && app.stage === stage
  );

  if (apps.length < 1) {
    logger.warn(
      `There are no apps to rollback for region ${region} and stage ${stage}`
    );
    return;
  }

  /**
   * Initialize control plane credentials and clients
   */
  const account = await controlPlaneAccount(stage, region);

  if (!account) {
    logger.warn(
      `Control Plane account was not found for given region and stage`,
      {
        region,
        stage,
      }
    );
    return;
  }

  const { accountId } = account;

  const credentials = getIsengardCredentialsProvider(
    accountId,
    "OncallOperator"
  );

  // We will use `us-east-1` as the region for all accounts since `LambdaEdgeConfig` is a global table and is not available in all regions
  const dynamodbIADClient = getDynamoDBDocumentClient("us-east-1", credentials);
  const dynamodbClient = getDynamoDBDocumentClient(region, credentials);

  const s3Client = new S3Client({
    region: region,
    credentials,
  });

  const appDAO = new AppDAO(stage, region, credentials);

  /**
   * Initialize compute service credentials and clients
   */
  const computeAccount = await computeServiceControlPlaneAccount(stage, region);

  if (!computeAccount) {
    logger.warn(
      `Compute Service account was not found for given region and stage`,
      {
        region,
        stage,
      }
    );
    return;
  }

  const { accountId: computeAccountId } = computeAccount;

  const computeAccountCredentials = getIsengardCredentialsProvider(
    computeAccountId,
    "OncallOperator"
  );

  const computeServiceClient: AmplifyHostingComputeClient =
    new AmplifyHostingComputeClient({
      endpoint: getComputeServiceEndpoint(stage, region),
      region,
      credentials: computeAccountCredentials,
    });

  const outputDir = `${__dirname}/output/${stage}-${region}`;

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, {
      recursive: true,
    });
  }

  await writeFile(
    `${outputDir}/rolled-back-branches.csv`,
    `appId,branchName\n`
  );
  await writeFile(
    `${outputDir}/skipped-branches.csv`,
    `appId,branchName\n`
  );

  for (const app of apps) {
    const { appId } = app;
    const edgeConfig = await getLambdaEdgeConfigForApp(
      dynamodbIADClient,
      appId
    );

    if (!edgeConfig) {
      logger.warn(`No LambdaEdgeConfig found for app ${appId}. Skipping.`);
      await appendFile(`${outputDir}/skipped-branches.csv`, `${appId},""\n`);
      continue;
    }

    const staticAssetSeparatedBranches = getStaticAssetSeparatedBranches(
      appId,
      edgeConfig
    );

    if (staticAssetSeparatedBranches.length < 1) {
      logger.warn(`No static asset branches found for app ${appId}`);
      await appendFile(`${outputDir}/skipped-branches.csv`, `${appId},""\n`);
      continue;
    }

    for (const staticAssetSeparatedBranch of staticAssetSeparatedBranches) {
      const { branchName, activeJobId } = staticAssetSeparatedBranch;

      if (
        await isStaticAssetSeparatedBranch(
          s3Client,
          appId,
          branchName,
          activeJobId,
          stage,
          region
        )
      ) {
        logger.info(
          `Static assets were separated for branch ${branchName} and job ${activeJobId} for app ${appId}. Starting deployment of combined bundle now...`
        );

        const app = await appDAO.getAppById(appId, [
          "accountId",
          "iamServiceRoleArn",
        ]);

        const { accountId, iamServiceRoleArn: customerRoleArn } = app;

        // Check if there are on-going jobs for this branch
        const jobsInProgressForBranchArn = [
          ...(await getJobIdsForBranchArn(
            dynamodbClient,
            stage,
            region,
            branchName,
            "PENDING"
          )),
          ...(await getJobIdsForBranchArn(
            dynamodbClient,
            stage,
            region,
            branchName,
            "RUNNING"
          )),
          ...(await getJobIdsForBranchArn(
            dynamodbClient,
            stage,
            region,
            branchName,
            "CANCELLING"
          )),
          ...(await getJobIdsForBranchArn(
            dynamodbClient,
            stage,
            region,
            branchName,
            "PROVISIONING"
          )),
        ];

        if (jobsInProgressForBranchArn.length > 0) {
          logger.warn(
            `Branch ${branchName} for app ${appId} has jobs in progress. Skipping this branch to avoid race conditions.`
          );
          await appendFile(
            `${outputDir}/skipped-branches.csv`,
            `${appId},${branchName}\n`
          );
          continue;
        }

        await startDeployment(computeServiceClient, {
          stackId: `arn:aws:amplify:${region}:${accountId}:apps/${appId}/branches/${branchName}`,
          deploymentId: `ROLLBACK-${activeJobId}`,
          appId,
          branchName,
          accountId,
          customerRoleArn,
          deploymentArtifact: {
            s3Bucket: `aws-amplify-${stage}-${region}-artifacts`,
            s3Key: `${appId}/${branchName}/${activeJobId}/BUILD/artifacts.zip`,
          },
        });

        logger.info(
          `Deployment of combined bundle kicked off for branch ${branchName} and job ${activeJobId} for app ${appId}`
        );

        await appendFile(
          `${outputDir}/rolled-back-branches.csv`,
          `${appId},${branchName}\n`
        );
      } else {
        logger.warn(
          `Static asset not separated for branch ${branchName} for app ${appId}`
        );
        await appendFile(
          `${outputDir}/skipped-branches.csv`,
          `${appId},${branchName}\n`
        );
      }
    }
  }
};

const getLambdaEdgeConfigForApp = async (
  dynamodb: DynamoDBDocumentClient,
  appId: string
) => {
  const edgeConfig = await getLambdaEdgeConfigForAppOrDomain(dynamodb, appId, [
    "appId,branchConfig",
  ]);

  if (edgeConfig) {
    return edgeConfig;
  }

  return null;
};

const getStaticAssetSeparatedBranches = (
  appId: string,
  edgeConfig: Partial<LambdaEdgeConfig>
): StaticAssetBranch[] => {
  const branches: StaticAssetBranch[] = [];

  if (!edgeConfig.branchConfig) {
    return branches;
  }

  for (const [branchName, branchConfig] of Object.entries(
    edgeConfig.branchConfig
  )) {
    if (branchConfig.version && branchConfig.version === "1") {
      logger.info(
        `Found affected branch ${branchName} in EdgeConfig item ${edgeConfig.appId}`
      );
      branches.push({
        appId,
        branchName: branchConfig.branchName,
        activeJobId: branchConfig.activeJobId,
      });
    }
  }

  return branches;
};

const isStaticAssetSeparatedBranch = async (
  s3Client: S3Client,
  appId: string,
  branchName: string,
  activeJobId: string,
  stage: Stage,
  region: Region
) => {
  const doesStaticAssetBundleExist = await doesObjectExist(
    s3Client,
    `aws-amplify-${stage}-${region}-artifacts`,
    `${appId}/${branchName}/${activeJobId}/BUILD/static-assets-bundle.zip`
  );

  if (!doesStaticAssetBundleExist) {
    logger.warn(
      `Static asset bundle does not exist for branch ${branchName} in app ${appId}`
    );
    return false;
  }

  const doesComputeBundleExist = await doesObjectExist(
    s3Client,
    `aws-amplify-${stage}-${region}-artifacts`,
    `${appId}/${branchName}/${activeJobId}/BUILD/compute-bundle.zip`
  );

  if (!doesComputeBundleExist) {
    logger.warn(
      `Compute bundle does not exist for branch ${branchName} in app ${appId}`
    );
    return false;
  }

  const doesCombinedBundleExist = await doesObjectExist(
    s3Client,
    `aws-amplify-${stage}-${region}-artifacts`,
    `${appId}/${branchName}/${activeJobId}/BUILD/artifacts.zip`
  );

  if (!doesCombinedBundleExist) {
    logger.warn(
      `Combined bundle does not exist for branch ${branchName} in app ${appId}`
    );
    return false;
  }

  return true;
};

const doesObjectExist = async (
  s3Client: S3Client,
  bucket: string,
  key: string
) => {
  try {
    const object = await s3Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );

    return object && object.$metadata.httpStatusCode === 200;
  } catch (error) {
    if ((error as S3ServiceException).$metadata.httpStatusCode === 404) {
      logger.warn(`Object ${key} does not exist in bucket ${bucket}`);
      return false;
    }
    throw error;
  }
};

main().then(console.log).catch(console.error);
