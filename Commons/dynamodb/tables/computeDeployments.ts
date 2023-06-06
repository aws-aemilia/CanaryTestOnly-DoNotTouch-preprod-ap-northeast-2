import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

interface ComputeDeployment {
  computeStackId: string;
  deploymentId: string;
  appId: string;
  accountId: string;
  branchName: string;
  status: "QUEUED" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED";
  artifacts: ComputeDeploymentArtifact[];
  stateMachineExecutionArn: string;
  customerRoleArn: string;
}

interface ComputeDeploymentArtifact {
  s3Bucket: string;
  s3Key: string;
}

/**
 * Finds a deployment in compute service DynamoDB deployments table,
 * returns null if not found.
 *
 * @param dynamodb Document client with creds for compute service account
 * @param computeStackId The computeStack (usually branchArn)
 * @param deploymentId The deploymentId of the job (usually buildId)
 *
 * @returns ComputeDeployment or null
 */
export async function findDeployment(
  dynamodb: DynamoDBDocumentClient,
  computeStackId: string,
  deploymentId: string
): Promise<ComputeDeployment | null> {
  try {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: "ComputeStackDeployments",
        Key: {
          computeStackId,
          deploymentId,
        },
      })
    );
    return result.Item as ComputeDeployment;
  } catch (e) {
    if (e instanceof ResourceNotFoundException) {
      return null;
    }
    throw e;
  }
}
