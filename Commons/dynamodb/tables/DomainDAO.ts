import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { DomainDO } from "../types";

export class DomainDAO {
  private tableName: string;
  private client: DynamoDBDocumentClient;

  constructor(
    private stage: string,
    private region: string,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    this.tableName = `${this.stage}-${this.region}-Domain`;
    const dynamoDBClient = new DynamoDBClient({
      region: this.region,
      credentials,
    });
    this.client = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  public async getDomainById(
    domainId: string,
    attributesToGet: string[] = ["appId"]
  ) {
    const domainItem = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "domainId-index",
        KeyConditionExpression: "domainId = :domainId",
        ExpressionAttributeValues: {
          ":domainId": domainId,
        },
        ProjectionExpression: attributesToGet.join(","),
      })
    );

    return domainItem.Items as DomainDO[] | undefined;
  }
}
