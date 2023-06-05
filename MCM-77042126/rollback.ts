import confirm from "../utils/confirm";
import logger from "../utils/logger";
import { ChangeAction, Route53Client, Change } from "@aws-sdk/client-route-53";
import { CloudFormationOutputs } from "./types";
import {
  getRecordsFromHostedZone,
  updateRecordsInHostedZone,
} from "../route53";

export async function rollbackRecords(
  route53Client: Route53Client,
  gatewayRootDomain: string,
  hostedZoneId: string,
  cfnOutputs: CloudFormationOutputs,
): Promise<void> {
  logger.info("Rolling back DNS changes");
  logger.info("Fetching existing A records from hosted zone");
  const records = await getRecordsFromHostedZone(
    route53Client,
    hostedZoneId,
    gatewayRootDomain,
    "A"
  );

  const changes: Change[] = records.map((record) => ({
    Action: ChangeAction.DELETE,
    ResourceRecordSet: {
      Name: record.Name,
      Type: record.Type,
      Weight: record.Weight,
      SetIdentifier: record.SetIdentifier,
      AliasTarget: {
        DNSName: record.AliasTarget?.DNSName,
        HostedZoneId: record.AliasTarget?.HostedZoneId,
        EvaluateTargetHealth: record.AliasTarget?.EvaluateTargetHealth,
      },
    },
  }));

  // Finally, push the current ALB record as a CREATE action. It needs
  // to be on the same batch of changes, but it needs to happen last, otherwise
  // the update fails.
  changes.push({
    Action: ChangeAction.CREATE,
    ResourceRecordSet: {
      Name: gatewayRootDomain,
      Type: "A",
      AliasTarget: {
        DNSName: cfnOutputs.HostingGatewayLoadBalancerDnsName,
        HostedZoneId:
          cfnOutputs.HostingGatewayLoadBalancerCanonicalHostedZoneId,
        EvaluateTargetHealth: false,
      },
    },
  });

  logger.info(changes, "The following DNS changes will be applied");
  await confirm("Ready to proceed with DNS update?");
  await updateRecordsInHostedZone(route53Client, hostedZoneId, {
    Changes: changes,
  });

  logger.info("Rollback complete");
}
