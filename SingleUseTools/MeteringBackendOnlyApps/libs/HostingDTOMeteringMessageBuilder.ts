import { AmplifyAccount } from "../../../Commons/Isengard";
import RIPHelper from "@amzn/rip-helper";
import { toDistroARN } from "./commons";

export type DeriverRecord = {
  serviceAccountId: string;
  accountId: string;
  actionType: "START" | "STOP";
  timestampMillis: number;
  resource: string;
  appArn: string;
  fifoMessageGroupId: string;
  messageVersion: string;
  usageType: string;
};

/**
 * Builds metering messages (DeriverRecord) exactly as the control plane does
 */
export class HostingDTOMeteringMessageBuilder {
  private controlPlaneAccount: AmplifyAccount;

  private usageType: string;

  constructor(acc: AmplifyAccount) {
    this.controlPlaneAccount = acc;

    /**
     * https://sage.amazon.dev/posts/1313145?t=7#1333146
     */
    RIPHelper.enableRetailRegions();

    /**
     * https://code.amazon.com/packages/AemiliaMeteringCommons/blobs/8249d16941680cc500f3d2d14abab274598613a8/--/src/com/amazon/aemiliametering/common/type/UsageTypeProvider.java#L12-L23
     */
    this.usageType = `${
      RIPHelper.getRegion(acc.region).billingPrefix
    }-DataTransferOut`;
  }

  /**
   * This needs to match how the message is assembled on the Control Plane
   * https://code.amazon.com/packages/AemiliaMeteringCommons/blobs/2a1412256cb918ac7e3e9bc336185d75380a7b1b/--/src/com/amazon/aemiliametering/common/client/MeteringClient.java#L95-L105
   */
  public build({
    distributionId,
    actionType,
    appId,
    customerAccountId,
  }: {
    distributionId: string;
    actionType: "START" | "STOP";
    appId: string;
    customerAccountId: string;
  }): DeriverRecord {
    const messageObject = {
      accountId: customerAccountId,
      actionType: actionType,
      appArn: `arn:aws:amplify:${this.controlPlaneAccount.region}:${customerAccountId}:apps/${appId}`,
      fifoMessageGroupId: distributionId,
      messageVersion: "1",
      resource: toDistroARN(this.controlPlaneAccount, distributionId),
      serviceAccountId: this.controlPlaneAccount.accountId,
      usageType: this.usageType,
      timestampMillis: Date.now(),
    };
    return messageObject;
  }
}
