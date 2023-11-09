import {
  computeServiceControlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";
import { DynamoDBDocumentClient, paginateScan } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export class ComputeStackDAO {
  private readonly stage: Stage;
  private readonly region: Region;
  private readonly role: string;
  private readonly tableName = "ComputeStacks";
  private dynamoDBClient?: DynamoDBDocumentClient;

  constructor(stage: Stage, region: Region, role = "ReadOnly") {
    this.region = region;
    this.stage = stage;
    this.role = role;
  }

  /**
   * Returns an iterator for a full scan of the items in the table.
   * Each item is a ComputeStackDO object.
   */
  public async paginate() {
    return paginateScan(
      {
        client: await this.getClient(),
        pageSize: 100,
      },
      {
        TableName: "ComputeStacks",
      }
    );
  }

  private async init() {
    const account = await computeServiceControlPlaneAccount(
      this.stage,
      this.region
    );

    this.dynamoDBClient = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: account.region,
        credentials: getIsengardCredentialsProvider(
          account.accountId,
          this.role
        ),
      })
    );
  }

  private async getClient() {
    if (!this.dynamoDBClient) {
      await this.init();
    }

    return this.dynamoDBClient!;
  }
}
