import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";
import {
  getIsengardCredentialsProvider,
  meteringAccount,
  preflightCAZ,
  Stage,
} from "Commons/Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocument, paginateScan } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import * as fs from "fs";

interface REMORecord {
  messageVersion: string;
  branchArn: string;
  operation: string;
  actionType: string;
  storagePathPrefix: string;
  payerId: string;
  usageType: string;
  accountId: string;
}

const getUsageTypeFromRegion = (region: string) => {
  switch (region) {
    case "ap-east-1":
      return "APE1-DataStorage";
    case "ap-northeast-1":
      return "APN1-DataStorage";
    case "ap-northeast-2":
      return "APN2-DataStorage";
    case "ap-south-1":
      return "APS3-DataStorage";
    case "ap-southeast-1":
      return "APS1-DataStorage";
    case "ap-southeast-2":
      return "APS2-DataStorage";
    case "ca-central-1":
      return "CAN1-DataStorage";
    case "eu-central-1":
      return "EUC1-DataStorage";
    case "eu-north-1":
      return "EUN1-DataStorage";
    case "eu-south-1":
      return "EUS1-DataStorage";
    case "eu-west-1":
      return "EU-DataStorage";
    case "eu-west-2":
      return "EUW2-DataStorage";
    case "eu-west-3":
      return "EUW3-DataStorage";
    case "me-south-1":
      return "MES1-DataStorage";
    case "sa-east-1":
      return "SAE1-DataStorage";
    case "us-east-1":
      return "USE1-DataStorage";
    case "us-east-2":
      return "USE2-DataStorage";
    case "us-west-1":
      return "USW1-DataStorage";
    case "us-west-2":
      return "USW2-DataStorage";
    default:
      throw new Error("Unrecognized region: " + region);
  }
};

const getAccountIdFromBranchArn = (branchArn: string) => {
  const splitBranchArn = branchArn.split("/");
  const splitFirstPartOfBranchArn = splitBranchArn[0].split(":");
  if (splitFirstPartOfBranchArn.length != 6) {
    throw new Error(`Invalid branch arn: ${branchArn}`);
  }
  return splitFirstPartOfBranchArn[4];
};

const getAnomalousRemoRecords = async (
  ddbDocClient: DynamoDBDocument,
  region: string,
  stage: string
) => {
  const tableName = `${stage}-${region}-RemoRecordAuditTable`;

  console.log(`Starting to scan table: ${tableName}`);

  const paginator = paginateScan(
    { client: ddbDocClient },
    { TableName: tableName }
  );

  const remoRecords = [];

  for await (const page of paginator) {
    if (page.Items) {
      for (const item of page.Items) {
        const { resourceArn, customResourceId, payerId, reason } = item;
        remoRecords.push({
          reason,
          message: {
            messageVersion: "1",
            branchArn: resourceArn,
            operation: "DELETE",
            actionType: "STOP",
            storagePathPrefix: customResourceId,
            payerId: payerId,
            accountId: getAccountIdFromBranchArn(resourceArn),
            usageType: getUsageTypeFromRegion(region),
          } as REMORecord,
        });
      }
    }
  }

  return remoRecords;
};

const sendMessagesToMeteringHostingStorageQueue = async (
  sqsClient: SQSClient,
  messages: REMORecord[],
  QueueUrl: string
) => {
  console.log(`Starting to send messages to: ${QueueUrl}`);
  for (const message of messages) {
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl,
        MessageBody: JSON.stringify(message),
        MessageGroupId: "foo",
      })
    );
  }
};

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .option("stage", {
      describe: "beta, gamma, preprod, or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "optional single region",
      type: "string",
      demandOption: true,
    })
    .option("dryrun", {
      describe: "If dryrun is set to 'y', then SQS messages will not be sent.",
      type: "string",
      demandOption: true,
      choices: ["y", "n"],
    })
    .strict()
    .version(false)
    .help().argv;

  const region = toRegionName(args.region);
  const stage = args.stage as Stage;
  const account = await meteringAccount(stage, region);
  const roleName = "OncallOperator";

  const isDryRun = args.dryrun === "y";

  await preflightCAZ({
    accounts: [account],
    role: [roleName],
  });

  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    roleName
  );

  const sqsClient = new SQSClient({ credentials, region });
  const ddbClient = new DynamoDBClient({ credentials, region });
  const ddbDocClient = DynamoDBDocument.from(ddbClient);

  const records = await getAnomalousRemoRecords(ddbDocClient, region, stage);

  fs.writeFileSync(
    `./${region}-${stage}-hosting-storage-stop-messages.json`,
    JSON.stringify(records, null, " ")
  );

  if (!isDryRun) {
    const queueUrl = `https://sqs.${region}.amazonaws.com/${account.accountId}/${stage}-${region}-MeteringHostingStorageQueue.fifo`;
    await sendMessagesToMeteringHostingStorageQueue(
      sqsClient,
      records.map((record) => record.message),
      queueUrl
    );
  }
};

main().then(() => console.log("done"));
