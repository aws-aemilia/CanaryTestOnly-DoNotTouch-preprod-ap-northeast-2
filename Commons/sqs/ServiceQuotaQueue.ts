import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "Commons/Isengard";

export class ServiceQuotaQueue {
  private sqsClient?: SQSClient;
  private queueUrl: string | undefined;
  private stage: Stage;
  private region: Region;

  constructor(stage: Stage, region: Region) {
    this.stage = stage;
    this.region = region;
  }
  public async init() {
    const getControlPlaneAccount = await controlPlaneAccount(
      this.stage,
      this.region
    );

    this.queueUrl = `https://sqs.${this.region}.amazonaws.com/${getControlPlaneAccount.accountId}/${this.stage}-${this.region}-AmplifyHostingServiceQuota-Queue`;
    // for testing to see what QUEUE url we get for development account
    console.log(`Queue URL: ${this.queueUrl}`);

    const credentials = getIsengardCredentialsProvider(
      getControlPlaneAccount.accountId,
      "OncallOperator"
    );

    this.sqsClient = new SQSClient({
      region: this.region,
      credentials,
    });
  }

  public sendUpdateLimitMessage(
    appId: string,
    limitName: string,
    value: number,
    accountId: string
  ) {
    if (!this.queueUrl) {
      throw new Error("class not initialized");
    }

    const messageBody = JSON.stringify({
      type: "UPDATE_LIMIT",
      body: {
        limitName: limitName,
        subjectId: appId,
        requestedValue: value,
        customerAccountId: accountId,
      },
    });

    if (!this.sqsClient) {
      throw new Error("SQS Client not initialized");
    } else {
      return this.sqsClient.send(
        new SendMessageCommand({
          DelaySeconds: 0,
          MessageBody: messageBody,
          QueueUrl: this.queueUrl,
        })
      );
    }
  }
}
