import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  migrateAppTable,
  migrateLambdaEdgeConfigTable,
  rollbackAppTable,
  rollbackLambdaEdgeConfigTable,
  migrateBranchTable,
  rollbackBranchTable,
} from "./tables";
import {
  getAccount,
  getAction,
  getAppId,
  getArgs,
  getCredentials,
  getDdbClient,
  getRegion,
  getStage,
} from "./helpers";
import { Credentials } from "../types";

async function run() {
  const args = getArgs();
  const region = getRegion(args);
  const stage = getStage(args);
  const action = getAction(args);
  const appId = getAppId(args);

  const account = getAccount(region, stage);

  const { accountId } = account;

  const credentials = await getCredentials(accountId, stage);
  const ddbClient = getDdbClient(region, credentials);

  if (action === "migrate") {
    await migrate(ddbClient, credentials, region, stage, appId);
  } else {
    await rollback(ddbClient, credentials, region, stage, appId);
  }
}

const migrate = async (
  ddbClient: DynamoDBDocumentClient,
  credentials: Credentials,
  region: string,
  stage: string,
  appId?: string
) => {
  console.log("Starting migration of App table");
  await migrateAppTable(ddbClient, region, stage, appId);
  console.log("Completed migration of App table");

  console.log("Starting migration of Branch table");
  await migrateBranchTable(ddbClient, region, stage, appId);
  console.log("Completed migration of Branch table");

  console.log("Starting migration of LambdaEdgeConfig table");
  await migrateLambdaEdgeConfigTable(
    ddbClient,
    credentials,
    region,
    stage,
    appId
  );
  console.log("Completed migration of LambdaEdgeConfig table");
};

const rollback = async (
  ddbClient: DynamoDBDocumentClient,
  credentials: Credentials,
  region: string,
  stage: string,
  appId?: string
) => {
  console.log("Starting rollback of App table");
  await rollbackAppTable(ddbClient, region, stage, appId);
  console.log("Completed rollback of App table");

  console.log("Starting rollback of Branch table");
  await rollbackBranchTable(ddbClient, region, stage, appId);
  console.log("Completed rollback of Branch table");

  console.log("Starting rollback of LambdaEdgeConfig table");
  await rollbackLambdaEdgeConfigTable(
    ddbClient,
    credentials,
    region,
    stage,
    appId
  );
  console.log("Completed rollback of LambdaEdgeConfig table");
};

run()
  .then(() => {
    console.log("Completed migration");
  })
  .catch((e) => {
    console.error("Error migrating", e);
  });
