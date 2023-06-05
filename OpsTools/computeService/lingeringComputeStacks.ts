import yargs from "yargs";
import sleep from "../../commons/utils/sleep";

import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
} from "@aws-sdk/client-sfn";

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

import {
  Stage,
  Region,
  AmplifyAccount,
  computeServiceControlPlaneAccounts,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../../commons/Isengard";
import { checkAppExists } from "../../commons/dynamodb";

/**
 * Finds compute stacks created by canary accounts that do not have a corresponding
 * Amplify App in the control plane and deletes them by starting a Destroyer Step Function
 * execution in Compute Service. This happened when we migrated from WEB_DYNAMIC to 
 * WEB_COMPUTE because of a bug in Control Plane where compute stacks were not deleted when 
 * the corresponding app was deleted.
 * 
 * Why is this script safe? 
 * - Because it only destroys compute stacks for accounts that we own (canaries), not for
 * customer accounts.
 * - Because before deleting the compute stack, it checks if the App indeed doesn't exist
 * in the Control Plane dynamodb App table. 
 * 
 * Is this script idempotent?
 * Yes, if there are no more compute stacks to delete, it won't do anything.
 * 
 * Technically this script will only be used once to cleanup all those thousands of lingering
 * compute stacks, but I am checking-in this script in case we ever need it again. 
 * 
 * To Run: 
 * npx ts-node OpsTools/computeService/lingeringComputeStacks \
 * --stage prod \
 * --region yul
 * 
 */

const ROLE_NAME = "OncallOperator";

const startDestroyExecution = async (
  sfnClient: SFNClient,
  computeAccount: AmplifyAccount,
  computeStackId: string,
) => {
  if (!computeStackId) {
    throw new Error("Invalid compute stackId" + computeStackId);
  }

  console.log("Starting destroy execution for computeStack", computeStackId);
  const startExecutionResponse = await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: `arn:aws:states:${computeAccount.region}:${computeAccount.accountId}:stateMachine:ComputeStackDestroyer`,
      input: JSON.stringify({
        computeStackId,
      }),
    })
  );

  if (!startExecutionResponse.executionArn) {
    throw new Error("Unable to start execution");
  }

  const executionArn = startExecutionResponse.executionArn;
  let executionFinished = false;

  do {
    await sleep(1000);
    const describeResponse = await sfnClient.send(
      new DescribeExecutionCommand({
        executionArn,
      })
    );

    if (describeResponse.status === "RUNNING") {
      console.log("Execution is running...");
      executionFinished = false;
    } else {
      console.log(
        "Execution finished with status",
        describeResponse.status,
        executionArn
      );
      executionFinished = true;
    }
  } while (!executionFinished);
};

const destroyCanaryComputeStacks = async (
  computeAccount: AmplifyAccount,
  canaryAccount: AmplifyAccount
) => {
  const creds = getIsengardCredentialsProvider(
    computeAccount.accountId,
    ROLE_NAME
  );

  const controlPlaneCreds = getIsengardCredentialsProvider(
    canaryAccount.accountId,
    "FullReadOnly"
  );

  const sfnClient = new SFNClient({
    credentials: creds,
    region: computeAccount.region,
  });

  const controlPlaneDynamoDB = new DynamoDBClient({
    credentials: controlPlaneCreds,
    region: canaryAccount.region,
  });

  const dynamodb = new DynamoDBClient({
    credentials: creds,
    region: computeAccount.region,
  });

  const documentClient = DynamoDBDocumentClient.from(dynamodb);
  const controlPlaneDocumentClient =
    DynamoDBDocumentClient.from(controlPlaneDynamoDB);

  console.log(
    "Querying dynamodb to find compute stacks for canary account",
    canaryAccount.accountId
  );

  const queryResponse = await documentClient.send(
    new QueryCommand({
      TableName: "ComputeStacks",
      IndexName: "ByCustomerAccountId",
      KeyConditionExpression: "accountId = :accountId",
      Limit: 1000,
      ProjectionExpression: "computeStackId, accountId, appId",
      ExpressionAttributeValues: {
        ":accountId": canaryAccount.accountId,
      },
    })
  );

  if (!queryResponse.Items) {
    throw new Error("No compute stacks found");
  }

  console.log(`Found ${queryResponse.Count} compute stacks`);
  for (const computeStack of queryResponse.Items) {
    console.log("--");
    console.log("Processing compute stack", computeStack.computeStackId);
    console.log(
      `Checking if corresponding app ${computeStack.appId} exists in control plane`
    );
    
    const appExists = await checkAppExists(
      controlPlaneDocumentClient,
      canaryAccount.stage,
      canaryAccount.region,
      computeStack.appId
    );

    if (!appExists) {
      console.log("Corresponding app does not exist. Its okay to delete compute stack");
      await startDestroyExecution(sfnClient, computeAccount, computeStack.computeStackId);
    }
  }
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Deletes lingering IAM roles that are not associated to a compute stack"
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command (optional)",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  const accounts = await computeServiceControlPlaneAccounts({
    stage: stage as Stage,
    region: region as Region,
  });

  for (const computeAccount of accounts) {
    console.log("==========================");
    console.log(
      "Processing compute service account",
      computeAccount.airportCode.toUpperCase(),
      computeAccount.accountId
    );

    const canaryAccount = await controlPlaneAccount(
      stage as Stage,
      computeAccount.region as Region
    );

    console.log("Corresponding canary account is", canaryAccount.accountId);
    console.log("==========================");
    await destroyCanaryComputeStacks(computeAccount, canaryAccount);
  }
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
