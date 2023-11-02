import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  getLambdaEdgeConfigForAppOrDomain,
  LambdaEdgeConfig,
} from "Commons/dynamodb";

export class EdgeConfigDAO {
  private readonly stage: Stage;
  private readonly region: Region;

  private lazyDDBClient?: DynamoDBDocumentClient;

  constructor(stage: Stage, region: Region) {
    this.region = region;
    this.stage = stage;
  }

  public async getLambdaEdgeConfigForAppOrDomain(
    domainOrAppId: string,
    attributesToGet?: string[]
  ): Promise<undefined | Partial<LambdaEdgeConfig>> {
    // may get rid of lambda-edge-config.ts and move its code here later
    return getLambdaEdgeConfigForAppOrDomain(
      await this.getDdbClient(),
      domainOrAppId,
      attributesToGet
    );
  }

  private async init() {
    const acc = await controlPlaneAccount(this.stage, this.region);

    const dynamoDBClient = new DynamoDBClient({
      region: "us-west-2", // global tables are not in all regions. A hardcoded region is simpler
      credentials: getIsengardCredentialsProvider(
        acc.accountId,
        "FullReadOnly"
      ),
    });
    this.lazyDDBClient = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  private async getDdbClient() {
    if (!this.lazyDDBClient) {
      await this.init();
    }
    return this.lazyDDBClient!;
  }
}
