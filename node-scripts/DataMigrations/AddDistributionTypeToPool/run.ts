import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  applyUpdateToAllItemsInTable,
  UpdateCommandFn,
} from "../dataMigrationUtils";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Executes a data migration on the WarmFrontEndResources table.
        This will add a distributionType attribute set to "LAMBDA_AT_EDGE" to all items in the table.
        
        This tool is meant to run once in prod and then be deleted.
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("rollback", {
      describe: "If present, will rollback the migration",
      type: "boolean",
      demandOption: false,
    })
    .option("mcm", {
      describe: "i.e. MCM-73116970. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .option("startingToken", {
      describe:
        "This correspond to the LastEvaluatedKey from the a previous run. Useful to resume a migration that was interrupted.",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, rollback, mcm, startingToken } = args;

  process.env.ISENGARD_MCM = mcm;

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  const tableName = `${account.stage}-${account.region}-WarmFrontEndResources`;

  const ddb = new DynamoDBClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });
  const ddbClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(ddb);

  const chosenBuildUpdateCommandFn: UpdateCommandFn = !rollback
    ? buildUpdateCommand.bind(null, tableName)
    : buildRollbackUpdateCommand.bind(null, tableName);

  await applyUpdateToAllItemsInTable(
    ddbClient,
    tableName,
    chosenBuildUpdateCommandFn,
    {
      ProjectionExpression: "resourceId",
      startingToken: startingToken ? { resourceId: startingToken } : undefined,
    }
  );
}

function buildUpdateCommand(TableName: string, Key: any): UpdateCommand {
  return new UpdateCommand({
    Key,
    TableName,
    UpdateExpression: "SET distributionType = :dt",
    ExpressionAttributeValues: {
      ":dt": "LAMBDA_AT_EDGE",
    },
  });
}

function buildRollbackUpdateCommand(
  TableName: string,
  Key: any
): UpdateCommand {
  return new UpdateCommand({
    Key,
    TableName,
    UpdateExpression: "REMOVE distributionType",
  });
}

main().catch((e) => {
  console.error(e);
});
