import pino from "pino";
import pinoPretty from "pino-pretty";
import confirm from "../../Commons/utils/confirm";
import {
  updateRecordsInHostedZone,
  getRecordsFromHostedZone,
} from "../../Commons/route53";
import { ChangeAction, Route53Client } from "@aws-sdk/client-route-53";

const logger = pino(pinoPretty());

export async function rollbackDelegation(
  route53Client: Route53Client,
  rootHostedZoneId: string,
  regionalDomainName: string
) {
  logger.info("Rolling back domain delegation");
  const nsRecords = await getRecordsFromHostedZone(
    route53Client,
    rootHostedZoneId,
    regionalDomainName,
    "NS"
  );

  // There should only be 1 NS record entry
  if (nsRecords.length !== 1) {
    logger.error(
      `Expected only one NS record, but found ${
        nsRecords.length
      } = ${JSON.stringify(nsRecords)}`
    );
    throw new Error("Unable to rollback");
  }

  const nsRecord = nsRecords[0];
  logger.info("Removing NS records from root hosted zone");

  await updateRecordsInHostedZone(route53Client, rootHostedZoneId, {
    Changes: [
      {
        Action: ChangeAction.DELETE,
        ResourceRecordSet: {
          Name: nsRecord.Name,
          Type: "NS",
          TTL: nsRecord.TTL,
          ResourceRecords: nsRecord.ResourceRecords,
        },
      },
    ],
  });
}
