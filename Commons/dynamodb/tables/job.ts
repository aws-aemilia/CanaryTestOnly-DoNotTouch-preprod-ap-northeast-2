import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommandInput,
  paginateQuery,
} from "@aws-sdk/lib-dynamodb";
import { Region, Stage } from "../../Isengard";
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

/**
 * Finds all jobs for a given branch and status. Returns an empty array if not found.
 * 
 * @param dynamodb Document client with creds for control plane account
 * @param stage Stage name (i.e. prod)
 * @param region Region name (i.e. us-west-2)
 * @param branchArn The branchArn of the job
 * @param statuses The status of the jobs to find
 * @returns 
 */
 export const getJobIdsForBranchArn = async (
  dynamodb: DynamoDBDocumentClient,
  stage: Stage,
  region: Region,
  branchArn: string,
  status: string,
) => {
  const queryCommandInput: QueryCommandInput = {
    TableName: `${stage}-${region}-Job`,
    Select: "SPECIFIC_ATTRIBUTES",
    ProjectionExpression: "jobId",
    IndexName: "statusIndex",
    KeyConditionExpression: `branchArn = :branchArn AND #status = :status`,
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":branchArn": branchArn,
      ":status": status,
    },
    Limit: 1000,
  };

  const jobIds: string[] = [];

  for await (const page of paginateQuery(
    { client: dynamodb },
    queryCommandInput
  )) {
    if (!page.Items) continue;
    jobIds.push(...page.Items.map((item) => item.jobId));
  }

  return jobIds;
};
