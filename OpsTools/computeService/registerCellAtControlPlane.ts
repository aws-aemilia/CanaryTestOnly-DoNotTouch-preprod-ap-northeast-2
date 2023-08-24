import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  computeServiceControlPlaneAccount,
  computeServiceDataPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
} from "../../Commons/Isengard";
import yargs from "yargs";
import confirm from "../../Commons/utils/confirm";

const TABLE_NAME = "CellAccounts";

const registerInactiveCellFn = (accountId: string): PutCommand => {
  return new PutCommand({
    Item: {
      accountId: accountId,
      status: "INACTIVE",
    },
    ConditionExpression: "attribute_not_exists(accountId)",
    TableName: TABLE_NAME,
  });
};

const activateCellFn = (accountId: string): UpdateCommand => {
  return new UpdateCommand({
    Key: {
      accountId: accountId,
    },
    UpdateExpression: "SET #status = :active",
    ExpressionAttributeNames: {
      "#status": "status",
    },
    ExpressionAttributeValues: {
      ":active": "ACTIVE",
      ":inactive": "INACTIVE",
    },
    ConditionExpression:
      "attribute_exists(accountId) and #status = :inactive and attribute_exists(amplifyRuntimeLayerArn) and attribute_exists(amplifySharedLibrariesLayerArn)",
    TableName: TABLE_NAME,
  });
};

type CellAction = "registerInactive" | "activate";

const registerAccount = async (
  stage: Stage,
  region: Region,
  cellNumber: number,
  action: CellAction
) => {
  const controlPlaneAccount = await computeServiceControlPlaneAccount(
    stage,
    region
  );
  const cellAccount = await computeServiceDataPlaneAccount(
    stage,
    region,
    cellNumber
  );

  console.log(
    `Working on cell account ${cellAccount.accountId} - ${cellAccount.email}`
  );

  const dynamodb = new DynamoDBClient({
    region: controlPlaneAccount.region,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount.accountId,
      "OncallOperator"
    ),
  });

  switch (action) {
    case "registerInactive":
      console.log("Registering cell account as INACTIVE");
      await dynamodb.send(registerInactiveCellFn(cellAccount.accountId));
      break;
    case "activate":
      await confirm(
        "Activating the cell account will immediately make it eligible to serve traffic. Are you sure you want to continue?"
      );
      console.log("Activating cell account");
      await dynamodb.send(activateCellFn(cellAccount.accountId));
      break;
    default:
      throw new Error(`unknown action ${action}`);
  }

  console.log("SUCCESS");
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
Registers a cell account by writing an entry to the CellAccounts DDB table.
The usual flow is to first register the account as INACTIVE, then activate it once all manual verification steps for the new cell are complete.

ts-node registerCellAtControlPlane.ts --command registerInactive --cellNumber 1 --stage beta --region pdx
ts-node registerCellAtControlPlane.ts --command activate --cellNumber 1 --stage beta --region pdx
`
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command. e.g. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("cellNumber", {
      describe: "cell number. e.g. 1",
      type: "number",
      demandOption: true,
    })
    .option("action", {
      describe: "stage to run the command",
      type: "string",
      choices: ["registerInactive", "activate"],
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, cellNumber, action } = args;

  await preflightCAZ({
    accounts: await computeServiceControlPlaneAccount(
      stage as Stage,
      region as Region
    ),
    role: "OncallOperator",
  });

  await registerAccount(
    stage as Stage,
    region as Region,
    cellNumber,
    action as CellAction
  );
};

main().catch((e) => {
  console.log("\nSomething went wrong");
  console.log(e);
  process.exit(1);
});
