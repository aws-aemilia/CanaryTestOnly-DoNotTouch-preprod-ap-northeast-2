import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export interface JobDO {
  branchArn: string;
  jobId: string;
  accountId: string;
  createTime: string;
  endTime: string;
  updateTime: string;
  jobType: string;
  status: string;
  jobSteps: JobStepDO[];
  version: number;
}

export interface JobStepDO {
  jobStatus: string;
  taskArn: string;
  name: "BUILD" | "DEPLOY" | "VERIFY";
  context: string;
  startTime: string;
  endTime: string;
  meteredStartTime: string;
  meteredEndTime: string;
  config: any;
  statusCode: string;
}

/**
 * Finds a Job by its jobId and branchArn. Returns null if not found.
 *
 * @param dynamodb Document client with creds for control plane account
 * @param stage Stage name (i.e. prod)
 * @param region Region name (i.e. us-west-2)
 * @param branchArn The branchArn of the job
 * @param jobId The jobId of the job
 *
 * @returns JobDO or null
 */
export async function findJob(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  branchArn: string,
  jobId: string
): Promise<JobDO | null> {
  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: `${stage}-${region}-Job`,
        Key: {
          branchArn,
          jobId,
        },
      })
    );
    return result.Item as JobDO;
  } catch (e) {
    if (e instanceof ResourceNotFoundException) {
      return null;
    }
    throw e;
  }
}
