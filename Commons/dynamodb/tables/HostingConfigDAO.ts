import {
  dataPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";
import { RoutingRulesDO } from "../types";
import {
  GetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  paginateScan,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = "HostingConfig";

export class HostingConfigDAO {
  private readonly stage: Stage;
  private readonly region: Region;
  private readonly role: string;

  private lazyDDBClient?: DynamoDBDocumentClient;

  constructor(stage: Stage, region: Region, role = "ReadOnly") {
    this.region = region;
    this.stage = stage;
    this.role = role;
  }

  /**
   * Scans the whole table. Use with caution.
   */
  async fullScan(): Promise<HostingConfigRow[]> {
    const client = await this.getDdbClient();

    const items = [];

    for await (const page of paginateScan(
      {
        client,
      },
      {
        TableName: TABLE_NAME,
        ProjectionExpression:
          "pk, sk, accountId, appId, branchName, activeJobId",
      }
    )) {
      if (page.Items) {
        items.push(...page.Items);
      }
    }

    return items as HostingConfigRow[];
  }

  async delete({ pk, sk }: { pk: string; sk: string }) {
    const client = await this.getDdbClient();

    return await client.send(
      new DeleteCommand({
        Key: {
          pk,
          sk,
        },
        TableName: TABLE_NAME,
      })
    );
  }

  async getRoutingRules(
    appId: string,
    branchName: string,
    activeJobId: string
  ): Promise<RoutingRulesDO | undefined> {
    const client = await this.getDdbClient();

    const response = await client.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: `${appId}/${branchName}`,
          sk: `${activeJobId}/RoutingRules`,
        },
      })
    );

    if (!response.Item) {
      return undefined;
    }

    return response.Item as RoutingRulesDO;
  }

  private async init() {
    const acc = await dataPlaneAccount(this.stage, this.region);

    const dynamoDBClient = new DynamoDBClient({
      region: acc.region,
      credentials: getIsengardCredentialsProvider(acc.accountId, this.role),
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

/**
 * Good enough for now. We can add more fields later.
 */
export type HostingConfigRow = {
  pk: string;
  sk: string;
  accountId: string;
  activeJobId: string;
  appId: string;
  branchName: string;
};
