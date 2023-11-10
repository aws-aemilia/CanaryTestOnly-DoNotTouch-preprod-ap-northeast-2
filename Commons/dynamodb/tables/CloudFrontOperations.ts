import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateScan,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";

export class CloudFrontOperationsDAO {
  private client: DynamoDBDocumentClient;

  constructor(
    private stage: string,
    private region: string,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    const dynamoDBClient = new DynamoDBClient({
      region: this.region,
      credentials,
    });
    this.client = DynamoDBDocumentClient.from(dynamoDBClient);
  }

  public paginate = () => {
    return paginateScan(
      {
        pageSize: 1000,
        client: this.client,
      },
      {
        TableName: "CloudFrontOperations",
      }
    );
  };

  public paginateDLQ = () => {
    return paginateScan(
      {
        pageSize: 1000,
        client: this.client,
      },
      {
        TableName: "CloudFrontOperations",
        IndexName: "dlq_items",
        FilterExpression: "dlq = :one",
        ExpressionAttributeValues: {
          ":one": 1,
        },
      }
    );
  };

  public async removeFromDLQ(operationId: string, distributionId: string) {
    this.client.send(
      new UpdateCommand({
        TableName: "CloudFrontOperations",
        Key: {
          operationId: operationId,
          distributionId: distributionId,
        },
        UpdateExpression:
          "SET queueVisible = :q, #s = :s REMOVE queued, failed, dlq",
        ExpressionAttributeNames: {
          "#s": "status",
        },
        ExpressionAttributeValues: {
          ":q": false,
          ":s": "DELETED",
        },
      })
    );
  }

  public async insertOperation(operation: CloudFrontOperationsDO) {
    this.client.send(
      new PutCommand({
        TableName: "CloudFrontOperations",
        Item: operation,
      })
    );
  }
}

export interface CloudFrontOperationsDO {
  operationId: string;
  distributionId: string;

  priority: number;
  createdTimestamp: string;
  lastUpdatedTimestamp: string;

  operation: DistributionOperation;
  queueVisible: Boolean;
  status?: string;
  retryAttempt?: number;

  queued?: number;
  failed?: number;
  dlq?: number;

  priorityOrder: string;
}

interface DistributionOperation {
  operationKind: string;
  accountId: string;
  appId: string;
  distributionId: string;
  arguments: Record<string, string>;
}
