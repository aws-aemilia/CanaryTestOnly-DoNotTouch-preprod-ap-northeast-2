import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateQuery,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { DomainDO } from "../types";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";
import { findDomainsByAppId } from "Commons/dynamodb";

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

  static async buildDefault(stage: string, region: string): Promise<DomainDAO> {
    return new DomainDAO(
      stage,
      region,
      getIsengardCredentialsProvider(
        (await controlPlaneAccount(stage as Stage, region as Region)).accountId,
        "FullReadOnly"
      )
    );
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

  public async findDomainsByAppId(appId: string): Promise<DomainDO[]> {
    return (
      (await findDomainsByAppId(this.client, this.stage, this.region, appId)) ??
      []
    );
  }

  /**
   * List Domains for a given appId.
   */
  paginateDomainsForApp = async (
    appId: string,
    attributesToGet: (keyof DomainDO)[] = ["appId", "domainId"]
  ) => {
    return paginateQuery(
      {
        client: this.client,
        pageSize: 100,
      },
      {
        TableName: this.tableName,
        KeyConditionExpression: "appId = :appId",
        ProjectionExpression: attributesToGet.join(","),
        ExpressionAttributeValues: {
          ":appId": appId,
        },
      }
    );
  };
}
