import {
  DynamoDBDocumentClient,
  paginateQuery,
} from "@aws-sdk/lib-dynamodb";

/**
 * List all branches for a given appId
 *
 * @param dynamodb Document Client with control plane credentials
 * @param stage i.e. beta, gamma, prod
 * @param region i.e. us-west-2
 * @param appId The appId to lookup
 * @param attributesToGet The attributes to return from the query
 */
export const paginateBranchesForApp = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  attributesToGet: string[] = ["appId", "branchArn"]
) => {
  return paginateQuery(
    {
      client: dynamodb,
      pageSize: 100,
    },
    {
      TableName: `${stage}-${region}-Branch`,
      ProjectionExpression: attributesToGet.join(", "),
      KeyConditionExpression: "appId = :appId",
      ExpressionAttributeValues: {
        ":appId": appId,
      },
    }
  );
};
