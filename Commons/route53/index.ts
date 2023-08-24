import {
  CreateHostedZoneCommand,
  ListHostedZonesByNameCommand,
  ListResourceRecordSetsCommandInput,
  ListResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommand,
  ChangeResourceRecordSetsCommandInput,
  InvalidChangeBatch,
  Route53Client,
  HostedZone,
  ResourceRecordSet,
  ChangeBatch,
  ListResourceRecordSetsCommandOutput,
  ListHostedZonesByNameCommandOutput,
} from "@aws-sdk/client-route-53";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { getIsengardCredentialsProvider, Stage } from "../Isengard";

export const DOMAIN_ACCOUNT = "673144583891"; // aws-mobile-aemilia-domain@amazon.com
export const DOMAIN_ACCOUNT_NON_PROD = "070306596019"; // amplify-team-domains@amazon.com

const logger = pino(pinoPretty());

/**
 * Executes the provided ChangeBatch in the given hosted zone. A ChangeBatch
 * can include DELETE, UPSERT, and CREATE actions for DNS records.
 *
 * @param route53Client The Route53 client
 * @param hostedZoneId The ID of the hosted zone to update
 * @param changeBatch The list of changes to execute
 */
export const updateRecordsInHostedZone = async (
  route53Client: Route53Client,
  hostedZoneId: string,
  changeBatch: ChangeBatch
) => {
  const changeResourceRecordSetsCommandInput: ChangeResourceRecordSetsCommandInput =
    {
      ChangeBatch: changeBatch,
      HostedZoneId: hostedZoneId,
    };

  try {
    logger.info(
      `Calling ChangeResourceRecordSets with = ${JSON.stringify(
        changeResourceRecordSetsCommandInput
      )}`
    );

    await route53Client.send(
      new ChangeResourceRecordSetsCommand(changeResourceRecordSetsCommandInput)
    );
  } catch (e) {
    if (
      e instanceof InvalidChangeBatch &&
      e.message.includes("already exists")
    ) {
      logger.info(
        "The validation records already exists. This is ok. Error was:",
        e.message
      );
    } else {
      throw e;
    }
  }
};

/**
 * Creates a new hosted zone in Route53, or returns the existing hosted zone
 * if it already exists.
 *
 * @param route53Client Route53 client
 * @param domainName Root domain for the new hosted zone
 * @param description Description to set in the new hosted zone
 *
 * @returns The newly created hosted zone, or the hosted zone if it already exists
 */
export const getOrCreateHostedZone = async (
  route53Client: Route53Client,
  domainName: string,
  description: string
): Promise<HostedZone> => {
  logger.info(`Checking if hosted zone exists for domain ${domainName}`);
  const hostedZone = await getHostedZone(route53Client, domainName);
  if (hostedZone) {
    return hostedZone;
  }

  logger.info(`Hosted zone does not exist. Creating it`);
  const createResponse = await route53Client.send(
    new CreateHostedZoneCommand({
      Name: domainName,
      CallerReference: new Date().toISOString(),
      HostedZoneConfig: {
        Comment: description,
      },
    })
  );

  logger.info("Hosted zone created successfully");
  return createResponse.HostedZone as HostedZone;
};

/**
 * Finds the hosted zone for a given domain name.
 *
 * @param route53Client The Route53 client
 * @param domainName The domain name for which to fetch the hosted zone
 * @returns The hosted zone for the given domain name, or null if it does not exist
 */
export const getHostedZone = async (
  route53Client: Route53Client,
  domainName: string
): Promise<HostedZone | null> => {
  logger.info(`Fetching hosted zone for domain ${domainName}`);
  const fullyQualifiedDomainName = `${domainName}.`;
  let nextPage = undefined;
  let hostedZone: HostedZone | undefined;

  do {
    const response: ListHostedZonesByNameCommandOutput =
      await route53Client.send(
        new ListHostedZonesByNameCommand({
          DNSName: domainName,
          HostedZoneId: nextPage,
        })
      );

    nextPage = response.NextHostedZoneId;
    hostedZone = response.HostedZones?.find(
      (hostedZone) => hostedZone.Name === fullyQualifiedDomainName
    );

    if (hostedZone) {
      logger.info(`Found hosted zone ${hostedZone.Id}`);
      return hostedZone;
    }
  } while (nextPage);

  logger.info("Hosted zone not found");
  return null;
};

/**
 * Returns all DNS records for a given hosted zone ID and domain name.
 *
 * @param route53Client Route53 client
 * @param hostedZoneId The hosted zone ID
 * @param domainName The domain name for which to match DNS records for
 * @param recordType DNS record type to filter by. Defaults to "ANY"
 *
 * @returns List of DNS records
 */
export const getRecordsFromHostedZone = async (
  route53Client: Route53Client,
  hostedZoneId: string,
  domainName: string,
  recordType: "CNAME" | "A" | "NS" | "ANY" | "SOA" = "ANY"
): Promise<ResourceRecordSet[]> => {
  let nextPage = undefined;
  const records: ResourceRecordSet[] = [];

  // To search records in Route53, domain needs trailing dot
  const fullyQualifiedDomainName = domainName.endsWith(".")
    ? domainName
    : `${domainName}.`;

  do {
    logger.info(`Fetching records for domain ${fullyQualifiedDomainName}`);
    const response: ListResourceRecordSetsCommandOutput =
      await route53Client.send(
        new ListResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          StartRecordIdentifier: nextPage,
        })
      );

    nextPage = response.NextRecordIdentifier;

    if (response.ResourceRecordSets) {
      records.push(
        ...response.ResourceRecordSets.filter(
          (r) =>
            r.Name &&
            r.Name.endsWith(fullyQualifiedDomainName) &&
            (recordType === "ANY" || r.Type === recordType)
        )
      );
    }
  } while (nextPage);

  logger.info(`Found ${records.length} records for ${domainName}`);
  return records;
};

/**
 * Returns a Route53 client with creadentials for the domain account.
 * For non-prod stages, the domain account is the amplify-team-domains account.
 * For prod stages, the domain account is the aws-mobile-aemilia-domain account.
 *
 * @param stage i.e. prod, beta, gamma
 * @returns Route53 cllient
 */
export const getRoute53Client = (stage: Stage, readonly: boolean = false) => {
  const accountId = getDomainAccountId(stage);
  return new Route53Client({
    credentials: getIsengardCredentialsProvider(
      accountId,
      readonly ? "ReadOnly" : "Route53Manager"
    ),
    region: "us-east-1", // Route53 is global
  });
};

const getDomainAccountId = (stage: Stage) => {
  return stage === "prod" ? DOMAIN_ACCOUNT : DOMAIN_ACCOUNT_NON_PROD;
};
