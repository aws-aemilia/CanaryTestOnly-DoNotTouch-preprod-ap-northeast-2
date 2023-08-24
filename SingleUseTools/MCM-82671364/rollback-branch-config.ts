import {
  findDomainsByAppId,
  getDynamoDBDocumentClient,
} from "../../Commons/dynamodb";
import { createLogger } from "../../Commons/utils/logger";
import yargs from "yargs";
import {
  Region,
  Stage,
  getIsengardCredentialsProvider,
  controlPlaneAccount,
} from "../../Commons/Isengard";
import path from "path";
import csv from "csvtojson";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

interface ScriptInput {
  stage: Stage;
  region: Region;
  appId?: string;
  branchName?: string;
}

interface BranchInput {
  appId: string;
  branchName: string;
}

const logger = createLogger();

const main = async () => {
  const args = (await yargs(process.argv.slice(2))
    .usage(
      `Rollback branch config for MCM-82671364
   
      Running this script will update the branch config version to "0" for all branches that have been rolled back. Run this script only after running the rollback.ts script.

      If appId and branchName are not provided, this script will automatically read the output from the rollback script and update the branch config version for all branches that have been rolled back.

      Usage:
      # For a single app and branch name
      npx ts-node rollback-branch-config.ts --stage prod --region us-west-2 --app-id d1a2b3c45 --branch-name main

      # For a list of apps (Automatically reads the output from the rollback script)
      npx ts-node rollback-branch-config.ts --stage prod --region us-west-2
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
    .option("branch-name", {
      alias: "branchName",
      describe:
        "The Amplify Branch Name. If provided, the rollback will only be applied against this branch.",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv) as ScriptInput;

  const { stage, region, appId, branchName } = args;

  logger.info(`Running with stage: ${stage} and region: ${region}`);

  process.env.ISENGARD_MCM = "MCM-82671364";

  let branchesToUpdate: BranchInput[] = [];

  if (appId && branchName) {
    branchesToUpdate.push({ appId, branchName });
  } else {
    const inputFile = `${__dirname}/output/${stage}-${region}/rolled-back-branches.csv`;
    const input = path.join(inputFile);

    logger.warn(`Looking up input file: ${input}`);

    branchesToUpdate.push(...(await csv().fromFile(input)));

    if (branchesToUpdate.length < 1) {
      logger.warn(
        `There are no branches to update for stage: ${stage} and region: ${region}`
      );
      return;
    }
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

  const appsToUpdate = branchesToUpdate.reduce<{ [appId: string]: string[] }>(
    (acc, { appId, branchName }) => {
      if (!acc[appId]) {
        acc[appId] = [];
      }
      acc[appId].push(branchName);
      return acc;
    },
    {}
  );

  for (const appId of Object.keys(appsToUpdate)) {
    const domainIds = (
      (await findDomainsByAppId(dynamodbClient, stage, region, appId)) || []
    ).map((d) => d.domainId);

    if (domainIds.length < 1) {
      logger.warn(`No custom domains found for appId: ${appId}`);
    }

    const appOrDomainIdsToUpdate = [appId, ...domainIds];
    const branchNames = appsToUpdate[appId];

    for (const appOrDomainId of appOrDomainIdsToUpdate) {
      logger.info(
        `Updating branch config version for appOrDomainId: ${appOrDomainId} to "0"`
      );
      await updateBranchConfigVersion(
        dynamodbIADClient,
        appOrDomainId,
        branchNames,
        "0"
      );
      logger.info(
        `Updated branch config version for appOrDomainId: ${appOrDomainId} to "0"`
      );
    }
  }
};

const updateBranchConfigVersion = async (
  dynamodb: DynamoDBDocumentClient,
  appOrDomainId: string,
  branchNames: string[],
  version: string
) => {
  const branchExpression = branchNames.reduce<{
    [branchNamePlaceholder: string]: string;
  }>((acc, branchName, i) => {
    acc[`#${branchName}${i}`] = branchName;
    return acc;
  }, {});

  const updateExpression = `SET ${branchNames
    .map(
      (branchName, i) => `#branchConfig.#${branchName}${i}.#version = :version`
    )
    .join(", ")}`;

  await dynamodb.send(
    new UpdateCommand({
      TableName: `LambdaEdgeConfig`,
      Key: {
        appId: appOrDomainId,
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: {
        "#branchConfig": "branchConfig",
        "#version": "version",
        ...branchExpression,
      },
      ExpressionAttributeValues: {
        ":version": version,
      },
    })
  );
};

main().then(console.log).catch(console.error);
