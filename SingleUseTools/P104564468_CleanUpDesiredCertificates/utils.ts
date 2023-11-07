import { S3 } from "@aws-sdk/client-s3";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  DomainDO,
  getDynamoDBDocumentClient,
  paginateDomains,
} from "Commons/dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "Commons/Isengard";
import logger from "Commons/utils/logger";

export const desiredCertificate = "desiredCertificate";
export const Prefix = "backups/";

export function getBucketName(stage: Stage, region: Region) {
  return `${stage}-${region}-cleanup-desired-certificate`;
}

export async function getClients(
  stage: Stage,
  region: Region,
  role: StandardRoles
) {
  const account = await controlPlaneAccount(stage, region);
  await preflightCAZ({ accounts: account, role });
  const credentials = getIsengardCredentialsProvider(account.accountId, role);

  const documentClient = getDynamoDBDocumentClient(region, credentials);
  const s3 = new S3({ region, credentials });
  return { documentClient, s3 };
}

export async function getDomainsToCleanUp(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: Region
) {
  const paginatedDomains = paginateDomains(
    documentClient,
    stage,
    region,
    undefined,
    undefined,
    `attribute_exists(${desiredCertificate})`
  );

  const domains = [];
  for await (const page of paginatedDomains) {
    domains.push(...(page.Items as DomainDO[]));
  }

  logger.info(`Found ${domains.length} domains to clean up`);
  return domains;
}

export async function getEarliestBackup(s3: S3, Bucket: string) {
  const listObjectsOutput = await s3.listObjects({
    Bucket,
    Prefix,
  });
  const listObjectsSorted =
    listObjectsOutput.Contents?.sort(
      (a, b) => a.LastModified!.getTime() - b.LastModified!.getTime()
    ) ?? [];

  const earliestBackup = listObjectsSorted[0];
  const getObjectOutput = await s3.getObject({
    Bucket,
    Key: earliestBackup?.Key,
  });
  const body = (await getObjectOutput.Body?.transformToString()) ?? "[]";
  return JSON.parse(body) as DomainDO[];
}
