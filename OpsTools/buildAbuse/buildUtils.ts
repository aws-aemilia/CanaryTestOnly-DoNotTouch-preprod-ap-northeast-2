import { CodeBuildClient, StopBuildCommand } from "@aws-sdk/client-codebuild";
import {
  AttributeValue,
  DynamoDBClient,
  QueryCommandInput,
  paginateQuery,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { Region, Stage } from "../../Isengard";

export interface Job {
  branchArn: string;
  jobId: string;
}

export const getRunningJobs = async (
  stage: Stage,
  region: Region,
  accountId: string,
  dynamoDBClient: DynamoDBClient
) => {
  const tableName = `${stage}-${region}-Job`;

  const queryCommandInput: QueryCommandInput = {
    TableName: tableName,
    Select: "SPECIFIC_ATTRIBUTES",
    ProjectionExpression: "jobId, branchArn",
    IndexName: "accountIdIndex",
    KeyConditionExpression: "accountId = :accountId and #status = :status",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":accountId": {
        S: accountId,
      },
      ":status": {
        S: "RUNNING",
      },
    },
    Limit: 1000,
  };

  const jobs: Job[] = [];

  let items: Record<string, AttributeValue>[] = [];
  for await (const page of paginateQuery(
    { client: dynamoDBClient },
    queryCommandInput
  )) {
    page.Items;
    items.push(...(page.Items || []));
  }
  if (items.length > 0) {
    for (const item of items) {
      if (item.jobId?.S && item.branchArn?.S) {
        const job: Job = {
          branchArn: item.branchArn.S,
          jobId: item.jobId.S,
        };
        jobs.push(job);
      }
    }
  }

  return jobs;
};

export const getJobTaskArn = async (
  stage: Stage,
  region: Region,
  job: Job,
  dynamoDBClient: DynamoDBDocumentClient
) => {
  const tableName = `${stage}-${region}-Job`;

  const getCommand = new GetCommand({
    TableName: tableName,
    ProjectionExpression: "jobSteps",
    Key: {
      branchArn: job.branchArn,
      jobId: job.jobId,
    },
  });

  const result = await dynamoDBClient.send(getCommand);

  const { Item } = result;

  if (!Item) {
    throw new Error(
      "Job not found for Job ID: " +
        job.jobId +
        " and branchArn: " +
        job.branchArn
    );
  }

  const steps = Item.jobSteps;

  for (const step of steps) {
    if (step.name === "BUILD") {
      return step.taskArn;
    }
  }
};

export const cancelBuild = async (
  taskArn: string,
  codeBuildClient: CodeBuildClient,
  logger: Console,
) => {
  try {
    const stopBuildCommand = new StopBuildCommand({
      id: taskArn,
    });
    await codeBuildClient.send(stopBuildCommand);
  } catch (error) {
    if ((error as Error).name === "ThrottlingException") {
      logger.warn(
        `ThrottlingException from CodeBuild for ${taskArn}. Skipping...`
      );
    }
  }
};
