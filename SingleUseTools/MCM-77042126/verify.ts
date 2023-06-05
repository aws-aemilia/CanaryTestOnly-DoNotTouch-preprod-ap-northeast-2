import logger from "../../Commons/utils/logger";
import { getRecordsFromHostedZone } from "../../Commons/route53";
import { CloudFormationOutputs } from "./types";
import { ResourceRecordSet, Route53Client } from "@aws-sdk/client-route-53";

export async function verifyRecords(
  route53Client: Route53Client,
  gatewayRootDomain: string,
  hostedZoneId: string,
  cfnOutputs: CloudFormationOutputs
): Promise<void> {
  // Verify that the A records in the Hosted Zone correspond to the ALB Shards
  // from the CloudFormation stack.
  const records = await getRecordsFromHostedZone(
    route53Client,
    hostedZoneId,
    gatewayRootDomain,
    "A"
  );

  if (!records || records.length === 0) {
    logger.error("No A records found in hosted zone. Proceed with rollback.");
    throw new Error("Verification failed");
  }

  logger.info(records, "Records found in hosted zone");

  // Verify shard1
  verifyRecordExist(
    records,
    gatewayRootDomain,
    cfnOutputs.HostingGatewayALBShard1DNS,
    cfnOutputs.HostingGatewayALBShard1HostedZoneId,
    50
  );

  // Verify shard2
  verifyRecordExist(
    records,
    gatewayRootDomain,
    cfnOutputs.HostingGatewayALBShard2DNS,
    cfnOutputs.HostingGatewayALBShard2HostedZoneId,
    50
  );

  logger.info("Verification complete");
}

function verifyRecordExist(
  records: ResourceRecordSet[],
  expectedName: string,
  expectedDNSName: string,
  expectedHostedZoneId: string,
  expectedWeight: number
) {
  const record = records.find((record) => {
    return (
      record.Name === `${expectedName}.` &&
      record.Type === "A" &&
      record.Weight === expectedWeight &&
      record.AliasTarget &&
      record.AliasTarget.HostedZoneId === expectedHostedZoneId &&
      record.AliasTarget.DNSName === `${expectedDNSName.toLocaleLowerCase()}.`
    );
  });

  if (!record) {
    logger.error(`Record for ${expectedDNSName} not found`);
    throw new Error("Verification failed");
  }

  logger.info(
    `Correctly found expected A record for ${expectedDNSName} ` +
      `with weight ${expectedWeight}`
  );
}
