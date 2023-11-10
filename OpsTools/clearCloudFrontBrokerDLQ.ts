import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateScan,
  UpdateCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import yargs from "yargs";
const crypto = require("crypto");

import {
  Region,
  Stage,
  StandardRoles,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "Commons/Isengard";
import logger from "Commons/utils/logger";
import { BatchIterator } from "Commons/utils/BatchIterator";

import { toRegionName } from "Commons/utils/regions";
import {
  CloudFrontOperationsDAO,
  CloudFrontOperationsDO,
} from "Commons/dynamodb";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Redrive CloudFront Broker DLQ messages

      Usage:

      npx ts-node OpsTools/clearCloudFrontBrokerDLQ.ts --stage beta --region pdx --dryRun
      `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      demandOption: true,
      type: "string",
    })
    .option("dryRun", {
      describe: "skips performing actions on operations",
      default: false,
      type: "boolean",
    })
    .option("limit", {
      describe: "number of apps to be migrated",
      type: "number",
      demandOption: false,
    })
    .option("skip", {
      describe: "number of apps to skip from top of the list",
      type: "number",
      demandOption: false,
    })
    .option("skipRedrive", {
      describe: "skip redriving operations. only clears them",
      default: false,
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region) as Region;

  const { dryRun, skipRedrive } = args;

  let credentials: Provider<AwsCredentialIdentity> | undefined;

  // Test accounts should use ada credentials update --account --role
  if (stage !== "test") {
    const account = await controlPlaneAccount(stage as Stage, region as Region);
    const role = StandardRoles.OncallOperator;

    await preflightCAZ({
      accounts: [account],
      role,
    });

    credentials = getIsengardCredentialsProvider(account.accountId, role);
  }

  const cloudFrontOperationsDAO = new CloudFrontOperationsDAO(
    stage,
    region,
    credentials
  );

  let rowsToProcess = [];
  for await (let page of cloudFrontOperationsDAO.paginateDLQ()) {
    let items = (page.Items || []) as CloudFrontOperationsDO[];

    for (let operation of items) {
      rowsToProcess.push(operation);
      logger.info(operation, "DLQ Operation");
    }
  }

  if (dryRun) {
    logger.warn("Skipping redriving operations");
    return;
  }

  for (const operation of rowsToProcess) {
    if (
      !skipRedrive &&
      operation.operation.operationKind !== "UPGRADE_TLS_VERSION"
    ) {
      const newOp = getRedrivableOperation(operation);
      logger.info(newOp, "Redriving");
      await cloudFrontOperationsDAO.insertOperation(newOp);
    }

    logger.info(operation, "Removing old item");
    await cloudFrontOperationsDAO.removeFromDLQ(
      operation.operationId,
      operation.distributionId
    );
  }
}

main().catch((err) => {
  logger.error(err, "Command execution failed");
  process.exit(1);
});

function getRedrivableOperation(
  oldOperation: CloudFrontOperationsDO
): CloudFrontOperationsDO {
  const priority = oldOperation.priority <= 100 ? 10 : 500;
  let now = new Date().toISOString();

  return {
    operationId: crypto.randomUUID(),
    distributionId: oldOperation.distributionId,
    queueVisible: true,
    queued: 1,
    priority,
    operation: oldOperation.operation,
    status: "NOT_STARTED",
    createdTimestamp: now,
    lastUpdatedTimestamp: now,
    priorityOrder: priority.toString().padStart(5, "0") + "__" + now,
  };
}
