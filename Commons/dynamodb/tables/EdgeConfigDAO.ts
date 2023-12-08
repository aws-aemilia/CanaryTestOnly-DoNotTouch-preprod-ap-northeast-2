import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateScan,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import {
  getLambdaEdgeConfigForAppOrDomain,
  LambdaEdgeConfig,
} from "Commons/dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";

export class EdgeConfigDAO {
  private readonly stage: Stage;
  private readonly region: Region;
  private readonly tableName = `LambdaEdgeConfig`;

  private ddbClient: DynamoDBDocumentClient;

  constructor(
    stage: Stage,
    region: Region,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    this.stage = stage;
    this.region = region;

    if (this.stage !== "test" && !credentials) {
      throw new Error("Credentials must be provided for non test stage");
    }

    const dynamoDBClient = new DynamoDBClient({
      region: "us-west-2", // global tables are not in all regions. A hardcoded region is simpler
      credentials,
    });
    this.ddbClient = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  static async buildDefault(
    stage: Stage,
    region: Region
  ): Promise<EdgeConfigDAO> {
    return new EdgeConfigDAO(
      stage,
      region,
      getIsengardCredentialsProvider(
        (await controlPlaneAccount(stage as Stage, region as Region)).accountId,
        "FullReadOnly"
      )
    );
  }

  public async getLambdaEdgeConfigForAppOrDomain(
    domainOrAppId: string,
    attributesToGet?: string[]
  ): Promise<undefined | Partial<LambdaEdgeConfig>> {
    // may get rid of lambda-edge-config.ts and move its code here later
    return getLambdaEdgeConfigForAppOrDomain(
      this.ddbClient,
      domainOrAppId,
      attributesToGet
    );
  }

  public async paginate(
    attributesToGet: string[] = ["appId"],
    pageSize = 1000
  ) {
    return paginateScan(
      {
        pageSize,
        client: this.ddbClient,
      },
      {
        TableName: this.tableName,
        ProjectionExpression: attributesToGet.join(","),
      }
    );
  }

  /**
   *
   * @param appId The appId/domainId to update
   */
  public setAccountId = async (appIdOrDomainId: string, accountId: string) => {
    const update = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        appId: appIdOrDomainId,
      },
      UpdateExpression: "SET accountId = :accountId",
      ExpressionAttributeValues: {
        ":accountId": accountId,
      },
    });

    return this.ddbClient.send(update);
  };

  /**
   *
   * @param appId The appId/domainId to remove the accountId field
   */
  public removeAccountId = async (appIdOrDomainId: string) => {
    const update = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        appId: appIdOrDomainId,
      },
      UpdateExpression: "REMOVE accountId",
    });

    return this.ddbClient.send(update);
  };
}
