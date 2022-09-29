import RIPHelper from "@amzn/rip-helper";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Isengard";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns"; // ES Modules import
import { parseBranchArn } from "../utils/arns";

type MeteringType = "build-time" | "hosting-storage" | "hosting-data-transfer";

// It doesn't matter which region the metering msg goes to, so we use wave1
const meteringQueues = {
  "build-time": {
    queueUrls: {
      gamma:
        "https://sqs.us-west-2.amazonaws.com/886159994414/gamma-us-west-2-MeteringBuildTimeQueue.fifo",
      prod: "https://sqs.ca-central-1.amazonaws.com/216941712347/prod-ca-central-1-MeteringBuildTimeQueue.fifo",
    },
    topicArns: {
      gamma: "arn:aws:sns:us-west-2:886159994414:MeteringBuildTimeTopic.fifo",
      prod: "arn:aws:sns:ca-central-1:216941712347:MeteringBuildTimeTopic.fifo",
    },
  },
  "hosting-storage": {
    queueUrls: {
      gamma:
        "https://sqs.us-west-2.amazonaws.com/886159994414/gamma-us-west-2-MeteringHostingStorageQueue.fifo",
      prod: "https://sqs.ca-central-1.amazonaws.com/216941712347/prod-ca-central-1-MeteringHostingStorageQueue.fifo",
    },
    topicArns: {
      gamma:
        "arn:aws:sns:us-west-2:886159994414:MeteringHostingStorageTopic.fifo",
      prod: "arn:aws:sns:ca-central-1:216941712347:MeteringHostingStorageTopic.fifo",
    },
  },
  "hosting-data-transfer": {
    queueUrls: {
      gamma:
        "https://sqs.us-west-2.amazonaws.com/886159994414/gamma-us-west-2-MeteringDataTransferQueue.fifo",
      prod: "https://sqs.ca-central-1.amazonaws.com/216941712347/prod-ca-central-1-MeteringDataTransferQueue.fifo",
    },
    topicArns: {
      gamma:
        "arn:aws:sns:us-west-2:886159994414:MeteringHostingDataTransferTopic.fifo",
      prod: "arn:aws:sns:ca-central-1:216941712347:MeteringHostingDataTransferTopic.fifo",
    },
  },
};

interface BaseMeteringRecord {
  /**
   * Payer account ID.
   */
  accountId: string;

  /**
   * Service product code.
   */
  productCode: string | null;

  /**
   * Service usage type.
   */
  usageType: string;

  /**
   * HTTP response code for the request.
   */
  httpResponseCode: string | null;

  /**
   * Ignore validations for metering records.
   */
  skipValidation?: boolean;
}

/**
 *
 * Example 
 * ```
 {
    "branchArn": "arn:aws:amplify:us-west-2:784447291930:apps/d3i33qgexample/branches/main",
    "accountId": "784447291930",
    "messageVersion": "1",
    "usageType": "USW2-DataStorage",
    "storagePathPrefix": "d3i33qgexample/main/0000000001/kfuhgs7tufgvvbht42oexample",
    "storageBytes": 1024,
    "actionType": "STOP",
    "operation": "PUT"
  }
````
 */
interface RemoRecord extends BaseMeteringRecord {
  accountId: string;
  /**
   * Version of this metering message.
   */
  messageVersion: "1";

  /**
   * Branch unique identifier.
   */
  branchArn: string;

  /**
   * Service operation.
   */
  operation: "DELETE" | "PUT";

  /**
   * Metering payer token.
   */
  platformToken: string | null;

  /**
   * Message action type.
   */
  actionType: "START" | "STOP";

  /**
   * Unique path prefix of the stored data.
   */
  storagePathPrefix: string;

  /**
   * Total size in bytes of the stored data.
   */
  storageBytes: number | null;
}

export class MeteringServiceClient {
  private client: SNSClient | undefined;

  constructor(
    private stage: "gamma" | "prod",
    private region: string,
    private dryRun = false
  ) {}

  public static generateStopMessage(
    branchArn: string,
    usageType: string,
    storagePathPrefix: string
  ): RemoRecord {
    const { accountId } = parseBranchArn(branchArn);
    // const example = {
    //   messageVersion: "1",
    //   httpResponseCode: null,
    //   accountId: "443281094091",
    //   branchArn:
    //     "arn:aws:amplify:eu-central-1:443281094091:apps/d2ivfnnt8ut41u/branches/pr-29",
    //   operation: "DELETE",
    //   platformToken: null,
    //   productCode: null,
    //   actionType: "STOP",
    //   usageType: "EUC1-DataStorage",
    //   storagePathPrefix:
    //     "d2ivfnnt8ut41u/pr-29/0000000008/zzsxm2w5angtbgcyolelhnhzqa",
    //   storageBytes: null,
    // };

    return {
      branchArn,
      usageType,
      storagePathPrefix,
      accountId,
      messageVersion: "1",
      actionType: "STOP",
      operation: "DELETE",
      httpResponseCode: null,
      platformToken: null,
      productCode: null,
      storageBytes: null,
    };
  }

  public async sendMessage(
    meteringType: MeteringType,
    message: string,
    messageGroupId: string
  ) {
    const topicArn: string =
      meteringQueues[meteringType]["topicArns"][this.stage];

    const publishCommand = new PublishCommand({
      TopicArn: topicArn,
      Message: message,
      MessageGroupId: messageGroupId,
    });

    console.log(`sending message to ${topicArn}: `, publishCommand.input);

    if (this.dryRun) {
      return;
    }

    const publishCommandOutput = await this.getSnsClient().then((c) =>
      c.send(publishCommand)
    );

    console.log(JSON.stringify(publishCommandOutput, null, 2));
    return publishCommandOutput;
  }

  private async getSnsClient() {
    if (this.client) {
      return this.client;
    }

    const account = await controlPlaneAccount(
      this.stage as Stage,
      this.region as Region
    );

    const credentials = getIsengardCredentialsProvider(
      account.accountId,
      "OnCallOperator"
    );
    this.client = new SNSClient({
      region: account.region,
      credentials,
    });

    return this.client;
  }
}
