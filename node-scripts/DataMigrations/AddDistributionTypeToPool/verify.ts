import { DDBItem, verifyMigration } from "../dataMigrationUtils";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Verifies a data migration on the WarmFrontEndResources table.
        This will verify that ALL items have a distributionType attribute set to "LAMBDA_AT_EDGE"
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
    .option("mcm", {
      describe: "i.e. MCM-73116970. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  const tableName = `${account.stage}-${account.region}-WarmFrontEndResources`;

  const ddb = new DynamoDBClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId),
  });

  const ddbClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(ddb);

  await verifyMigration(ddbClient, tableName, verifyDistributionType, {
    ProjectionExpression: "resourceId,distributionType",
  });
}

function verifyDistributionType(item: DDBItem): boolean {
  return item.distributionType === "LAMBDA_AT_EDGE";
}

main().catch((e) => {
  console.error(e);
});
