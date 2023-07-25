import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  UpdateCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { WarmingPoolResourceDO } from "../types";

export class WarmResourcesDAO {
  private tableName: string;
  private client: DynamoDBDocumentClient;

  constructor(
    private stage: string,
    private region: string,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    this.tableName = `${this.stage}-${this.region}-WarmFrontEndResources`;
    const dynamoDBClient = new DynamoDBClient({
      region: this.region,
      credentials,
    });
    this.client = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  public getResourceById = async (
    resourceId: string,
    attributesToGet?: string[]
  ) => {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        ProjectionExpression: attributesToGet?.join(","),
        Key: { resourceId },
      })
    );

    return response.Item as WarmingPoolResourceDO | undefined;
  };

  public updateResourceDistType = async (
    resourceId: string,
    distributionType: "LAMBDA_AT_EDGE" | "GATEWAY"
  ): Promise<UpdateCommandOutput> => {
    const queryResponse = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          resourceId,
        },
        UpdateExpression: "SET distributionType = :dt",
        ExpressionAttributeValues: {
          ":dt": distributionType,
        },
      })
    );

    return queryResponse;
  };
}
