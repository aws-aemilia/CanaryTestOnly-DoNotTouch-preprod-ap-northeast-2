import { CodeBuildClient } from "@aws-sdk/client-codebuild";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getRunningJobs, getJobTaskArn, cancelBuild } from "./buildUtils";
import { Region, Stage } from "../../Isengard";
import confirm from "../../utils/confirm";
const { chunkPromise, PromiseFlavor } = require("chunk-promise");
import { Credentials, Provider } from "@aws-sdk/types";

/**
 * Stop all running builds for a given list of accounts.
 *
 * @param stage
 * @param region
 * @param credentials
 * @param accountIds
 * @param concurrency
 * @param logger
 * @param needConfirmation
 */
export const stopBuilds = async (
  stage: Stage,
  region: Region,
  credentials: Provider<Credentials>,
  accountIds: string[],
  concurrency: number,
  logger: Console,
  needConfirmation: boolean
) => {
  const dynamoDBClient = new DynamoDBClient({
    region,
    credentials,
  });

  const ddbDocumentClient = DynamoDBDocumentClient.from(dynamoDBClient);

  const codeBuildClient = new CodeBuildClient({
    region,
    credentials,
    maxAttempts: 5,
  });

  const promises: (() => Promise<void>)[] = [];

  for (const accountId of accountIds) {
    promises.push(() =>
      stopBuildsForAccount(
        stage,
        region,
        accountId,
        dynamoDBClient,
        ddbDocumentClient,
        codeBuildClient,
        logger,
        needConfirmation
      )
    );
  }

  await chunkPromise(promises, {
    concurrent: concurrency,
    promiseFlavor: PromiseFlavor.PromiseAll,
  });
};

/**
 * Stop all running builds for a given account.
 *
 * @param stage
 * @param region
 * @param accountId
 * @param dynamoDBClient
 * @param ddbDocumentClient
 * @param codeBuildClient
 * @param logger
 * @param needConfirmation
 * @returns
 */
export const stopBuildsForAccount = async (
  stage: Stage,
  region: Region,
  accountId: string,
  dynamoDBClient: DynamoDBClient,
  ddbDocumentClient: DynamoDBDocumentClient,
  codeBuildClient: CodeBuildClient,
  logger: Console,
  needConfirmation: boolean = true
) => {
  const jobs = await getRunningJobs(stage, region, accountId, dynamoDBClient);

  if (jobs.length < 1) {
    logger.log(`No running jobs found for account ${accountId}. Skipping...`);
    return;
  }

  logger.warn(
    `${
      jobs.length
    } jobs will be cancelled for account ${accountId}: \n\n ${jobs.map(
      (job) => {
        return `${job.branchArn}: ${job.jobId}\n`;
      }
    )}`
  );

  if (
    !needConfirmation ||
    (await confirm("Are you sure you want to cancel these builds?"))
  ) {
    for (const job of jobs) {
      const taskArn = await getJobTaskArn(
        stage,
        region,
        job,
        ddbDocumentClient
      );

      logger.log(
        `Canceling build ${taskArn} for accountID ${accountId}; Branch ARN: ${job.branchArn} Job ID: ${job.jobId};`
      );

      await cancelBuild(taskArn, codeBuildClient, logger);

      logger.log(`Build ${taskArn} for accountID ${accountId} cancelled`);
    }
  }
};
