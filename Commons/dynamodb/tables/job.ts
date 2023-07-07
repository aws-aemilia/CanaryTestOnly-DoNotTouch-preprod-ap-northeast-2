import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  paginateQuery,
} from "@aws-sdk/lib-dynamodb";
import { JobDO } from "../types";

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

/**
 * Lists all jobs for a given branchArn.
 *
 * @param dynamodb Document client with creds for control plane account
 * @param stage Stage name (i.e. prod)
 * @param region Region name (i.e. us-west-2)
 * @param branchArn The branchArn of the job
 * @param attributesToGet Optional list of job attributes to fetch
 * @param exclusiveStartKey Optional exclusiveStartKey to start pagination from
 */
export const paginateJobsForBranch = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  branchArn: string,
  attributesToGet: string[] = ["branchArn", "jobId"],
) => {
  return paginateQuery(
    {
      client: dynamodb,
      pageSize: 100,
    },
    {
      TableName: `${stage}-${region}-Job`,
      ProjectionExpression: attributesToGet.join(", "),
      KeyConditionExpression: "branchArn = :branchArn",
      ExpressionAttributeValues: {
        ":branchArn": branchArn,
      },
    }
  );
};
