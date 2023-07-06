import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { Credentials, Provider } from "@aws-sdk/types";
import { AppDOJava, BranchDOJava } from "../dynamodb";
import { getQueueUrl } from "../utils/sqs";

export class AsyncResourceDeletionQueue {
  private sqsClient;
  private queueUrl: string | undefined;

  constructor(
    region: string,
    private stage: string,
    credentials?: Provider<Credentials>,
    private alias?: string
  ) {
    this.sqsClient = new SQSClient({
      region,
      credentials,
    });

    if (stage === "test" && !this.alias) {
      throw new Error("alias is required for test stage");
    }
  }
  public async init() {
    this.queueUrl = await getQueueUrl(
      this.sqsClient,
      this.stage === "test"
        ? `sam-dev-${this.alias}-AemiliaControlPlaneLambd-AsyncResourceDeletionQueue`
        : "AemiliaControlPlaneLambda-AsyncResourceDeletionQueue"
    );
  }

  public sendDeleteBranchMessage(appDO: AppDOJava, branchDO: BranchDOJava) {
    if (!this.queueUrl) {
      throw new Error("class not initialized");
    }

    const message = {
      Type: "Branch",
      AppDO: appDO,
      BranchDO: branchDO,
    };

    return this.sqsClient.send(
      new SendMessageCommand({
        DelaySeconds: 0,
        MessageBody: JSON.stringify(message),
        QueueUrl: this.queueUrl,
      })
    );
  }
}
