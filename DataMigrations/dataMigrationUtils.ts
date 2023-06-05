import {
  DynamoDBDocumentClient,
  paginateScan,
  ScanCommandInput,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import pLimit from "p-limit";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { NativeAttributeValue } from "@aws-sdk/util-dynamodb";

const log = pino(pinoPretty());

export type DDBItem = Record<string, NativeAttributeValue>;
export type UpdateCommandFn = (item: DDBItem) => UpdateCommand;
export type VerifyItemFn = (item: DDBItem) => boolean;

const MAX_CONCURRENT_DDB_WRITE_REQUESTS = 20;

/**
 * Updates ALL items in a DDB Table by applying the provided updateCommandFn to each item
 *
 * This will not stop if any DDB write fails. It will log the failed item and continue
 *
 * @param ddbClient
 * @param TableName
 * @param updateCommandFn - function that describes the update to be applied to each item. It takes in the item and returns an UpdateCommand
 * @param Options
 * @param Options.ProjectionExpression - projection expression for the initial table scan. This is mostly an optimization
 *                                       to reduce the RCU from the table scan
 * @param Options.startingToken - startingToken for the initial table scan. Can be useful to continue an update that was interrupted
 */
export async function applyUpdateToAllItemsInTable(
  ddbClient: DynamoDBDocumentClient,
  TableName: string,
  updateCommandFn: UpdateCommandFn,
  {
    ProjectionExpression,
    startingToken,
  }: {
    ProjectionExpression?: string;
    startingToken?: Record<string, string>;
  } = {}
) {
  log.info(`Starting update for items on table ${TableName}`);
  const scanCommandInput: ScanCommandInput = {
    TableName,
    ProjectionExpression,
  };

  for await (const page of paginateScan(
    { client: ddbClient, startingToken },
    scanCommandInput
  )) {
    const updateCommands: UpdateCommand[] = page?.Items?.map(updateCommandFn) ?? [];
    const updateFns: (() => Promise<void>)[] = updateCommands.map(
      (cmd) => async () => {
        return ddbSendIgnoringExceptions(ddbClient, cmd);
      }
    );

    log.info(`Updating Items for a page of size ${page.Items?.length}:`);
    const startTimestamp = Date.now();

    const limit = pLimit(MAX_CONCURRENT_DDB_WRITE_REQUESTS);

    // All promises are expected to succeed since they are wrapped by ddbSendIgnoringExceptions
    await Promise.all(updateFns.map(limit));

    const endTimestamp = Date.now();
    log.info(
      `Took ${endTimestamp - startTimestamp} ms. ${Math.round(
        1000 * ((endTimestamp - startTimestamp) / page.Items!.length)
      )} ms per 1k items.`
    );
    log.info(`Successfully updated all Items for this page`);
    page.LastEvaluatedKey &&
      log.info(
        `next page startingToken: ${JSON.stringify(page.LastEvaluatedKey)}\n`
      );
  }
  log.info(`Successfully updated All Items on table ${TableName}`);
}

/**
 * Verifies ALL items in a DDB Table by applying the provided verifyFn to each item
 *
 * @param ddbClient
 * @param TableName
 * @param verifyItemFn - function that verifies each item. It takes in the item and returns true if the item is valid
 * @param Options
 * @param Options.ProjectionExpression - projection expression for the initial table scan. This is mostly an optimization
 *                                       to reduce the RCU from the table scan
 * @param Options.startingToken - startingToken for the initial table scan.
 *
 */
export async function verifyMigration(
  ddbClient: DynamoDBDocumentClient,
  TableName: string,
  verifyItemFn: VerifyItemFn,
  {
    ProjectionExpression,
    startingToken,
  }: {
    ProjectionExpression?: string;
    startingToken?: Record<string, string>;
  } = {}
) {
  log.info(`Starting verification for items on table ${TableName}`);
  const scanCommandInput: ScanCommandInput = {
    TableName,
    ProjectionExpression,
  };

  const badItems: DDBItem[] = [];

  for await (const page of paginateScan(
    { client: ddbClient, startingToken },
    scanCommandInput
  )) {
    log.info(`Verifying Items for a page of size ${page.Items?.length}`);

    const flipVerifyItemFn = (item: DDBItem) => !verifyItemFn(item);
    const badItemsInPage = page!.Items!.filter(flipVerifyItemFn);
    badItems.push(...badItemsInPage);

    if (badItemsInPage.length > 0) {
      log.warn(`Found ${badItemsInPage.length} bad items in this page`);
    }
  }

  if (badItems.length > 0) {
    log.error(
      `FAILED: Found ${badItems.length} bad items on table ${TableName}`
    );
    // log.error(JSON.stringify(badItems, null, 2));
    throw new Error(`Verification failed. Found ${badItems.length} that failed verification`);
  }

  log.info(`Successfully verified all Items on table ${TableName}!`);
}

/**
 * Swallow the exceptions so that the migration is not halted by transient errors
 */
async function ddbSendIgnoringExceptions(
  ddbClient: DynamoDBDocumentClient,
  cmd: UpdateCommand
): Promise<void> {
  try {
    await ddbClient.send(cmd);
  } catch (e) {
    log.error(
      `Failed to update item with key: ${JSON.stringify(
        cmd?.input?.Key
      )}. Error was: ${(e as Error).name} - ${(e as Error).message}`
    );
  }
}
