import {
  DynamoDBClient,
  GetItemCommand,
  GetItemCommandInput,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Isengard";
import { doQuery } from "../libs/CloudWatch";
import { parseBranchArn } from "../utils/arns";
import { KonaFileReader } from "./KonaFileReader";

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Generates a list of branch arns that should not have been billed
ts-node billingAuditor.ts --stage prod --region ap-northeast-2 --konaFile "konafiles/2022-09-01" --startDate "2022-08-01T00:00:00" --invalidArnsFile "artifacts/invalidArns-ap-northeast-2"
      `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("konaFile", {
      describe: "path to input kona file",
      type: "string",
      demandOption: true,
    })
    .option("invalidArnsFile", {
      describe:
        "The path to the file where the invalid branch arns will be written",
      type: "string",
      demandOption: true,
    })
    .option("startDate", {
      describe:
        "Kona bill's month start date in ISO format, for example 2022-08-01T00:00:00",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { konaFile, invalidArnsFile, stage, region, startDate } = args;

  const account = await controlPlaneAccount(stage as Stage, region as Region);

  const outStream = fs.createWriteStream(invalidArnsFile, { flags: "a" });

  const billedArns = await getResourcesBilled(account, konaFile);
  console.info("BilledArns:");
  console.info(billedArns);

  const deletedBranchArnsSinceBillingMonth = new Set(
    (await getDeletedBranchArns(
      stage,
      region,
      new Date(startDate),
      new Date()
    )) || []
  );

  console.info("deletedBranchArnsSinceBillingMonth");
  console.info(deletedBranchArnsSinceBillingMonth);

  const dynamodb = await getDDbClient(account);
  for (const billedBranchArn of billedArns) {
    if (deletedBranchArnsSinceBillingMonth.has(billedBranchArn)) {
      console.log(
        billedBranchArn +
          " => ✅ valid bill: branch deleted during/after the billing month"
      );
      continue;
    }

    if (await getBranchByArn(dynamodb, billedBranchArn, account.region)) {
      console.log(
        billedBranchArn + " => ✅ valid bill: branch currently active"
      );
      continue;
    }

    console.log(billedBranchArn + " => ❌ invalid bill: branch does not exist");
    outStream.write(billedBranchArn + "\n");
  }

  outStream.close();
};

async function getDDbClient(account: AmplifyAccount, role = "ReadOnly") {
  const credentials = getIsengardCredentialsProvider(account.accountId, role);
  const dynamodbClient = new DynamoDBClient({
    region: account.region,
    credentials,
  });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

export async function getBranchByArn(
  db: DynamoDBDocumentClient,
  branchArn: string,
  region: string
) {
  const { appId, branch } = parseBranchArn(branchArn);

  var params: GetItemCommandInput = {
    TableName: `prod-${region}-Branch`,
    Key: {
      appId: {
        S: appId,
      },
      branchName: {
        S: branch,
      },
    },
    ProjectionExpression: "branchArn",
  };
  const result = await db.send(new GetItemCommand(params));
  return result.Item;
}

async function getDeletedBranchArns(
  stage: string,
  region: string,
  startDate: Date,
  endDate: Date
) {
  const account = await controlPlaneAccount(stage as Stage, region as Region);
  const query = `
  fields @timestamp, @message
  | filter strcontains(@message, "Cleanup finished for bucket")
  | parse @message "Cleanup finished for bucket aws-amplify-prod-${account.region}-website-hosting with prefix *" as arn
  | filter ispresent(arn)
  | parse arn "*/*/*" as appId, branch
  | display concat("arn:aws:amplify:${account.region}:${account.accountId}:apps/",appId,"/branches/",branch) as branchArn
  `;
  return doQuery(
    account,
    "/aws/lambda/AemiliaControlPlaneLambda-AsyncResourceDeletionFun",
    query,
    startDate,
    endDate
  );
}

async function getResourcesBilled(account: AmplifyAccount, konaFile: string) {
  const arnsBilled = new Set<string>();

  // const canaryAccounts = [
  //   "024873182396",
  //   "574285171994",
  //   "190546094896",
  //   "320933843292",
  //   "664363737505",
  // ];
  // const canaryArnPrefixes = canaryAccounts.map(
  //   (accountId) => arnRegionPrefix + accountId
  // );

  const arnRegionPrefix = `arn:aws:amplify:${account.region}:`;

  const konaFileReader = new KonaFileReader(konaFile);
  await konaFileReader.readLines((_, { resource }) => {
    if (resource.startsWith(arnRegionPrefix)) {
      arnsBilled.add(resource);
    }

    // // Skip canary and integration test accounts
    // if (canaryArnPrefixes.find((prefix) => resource.startsWith(prefix))) {
    //   continue;
    // }
  });

  return arnsBilled;
}

// if is entrypoint
if (require.main === module) {
  main()
    .then()
    .catch((e) => {
      console.log("\nSomething went wrong");
      console.log(e);
    });
}
