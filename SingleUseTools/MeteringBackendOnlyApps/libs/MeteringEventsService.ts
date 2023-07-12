import {
  getIsengardCredentialsProvider,
  meteringAccount,
  Region,
  Stage,
} from "../../../Commons/Isengard";
import {
  DynamoDBDocumentClient,
  paginateScan,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

export type MeteringEvent = {
  distributionArn: string;
  actionType: string;
  appArn: string;
  timestampMillis: number;
};

/**
 * Simple class to interpret the MeteringHostingDataTransferEvents DDB table
 */
export class MeteringEventsService {
  private stage: string;
  private region: string;

  private meteringEventsByDistroArn: Record<string, MeteringEvent[]> = {};

  constructor(stage: string, region: string) {
    this.stage = stage;
    this.region = region;
  }

  /**
   * For the intended use of this tool is much faster to scan the entire table instead of doing individual queries for each distribution.
   */
  public async init() {
    const acc = await meteringAccount(
      this.stage as Stage,
      this.region as Region
    );

    const ddb = DynamoDBDocumentClient.from(
      new DynamoDBClient({
        region: acc.region,
        credentials: getIsengardCredentialsProvider(acc.accountId, "ReadOnly"),
      })
    );

    const scanInput: ScanCommandInput = {
      TableName: `${acc.stage}-${acc.region}-MeteringHostingDataTransferEvents`,
      ProjectionExpression:
        "distributionArn, timestampMillis, actionType, appArn",
    };

    for await (const page of paginateScan({ client: ddb }, scanInput)) {
      if (page.Items) {
        page.Items.forEach((item) => {
          const { distributionArn } = item;
          this.meteringEventsByDistroArn[distributionArn] =
            this.meteringEventsByDistroArn[distributionArn] ?? [];
          this.meteringEventsByDistroArn[distributionArn].push(
            item as MeteringEvent
          );
        });
      }
    }

    Object.keys(this.meteringEventsByDistroArn).forEach((distroArn) => {
      this.meteringEventsByDistroArn[distroArn].sort((a, b) => {
        return a.timestampMillis < b.timestampMillis ? 1 : -1; // descending
      });
    });
  }

  public isStopped(distributionArn: string): boolean {
    const events = this.meteringEventsByDistroArn[distributionArn] ?? [];

    if (events.length === 0) {
      // there are no entries for this distribution, so it is not stopped
      return false;
    }
    // only latest event matters. pick the zero index since it is order in descending order by timestamp
    return events[0].actionType === "STOP";
  }
}
