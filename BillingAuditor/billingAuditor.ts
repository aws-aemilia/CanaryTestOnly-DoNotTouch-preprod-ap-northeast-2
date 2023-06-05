import {
  BatchGetItemCommand,
  BatchGetItemCommandInput,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../commons/Isengard";
import { doQuery } from "../commons/libs/CloudWatch";
import { parseBranchArn } from "../commons/utils/arns";
import { KonaFileReader } from "./KonaFileReader";
import * as path from "path";
import { BatchIterator } from "../commons/utils/BatchIterator";


/**
 * Branch A
 * 
 * 08/01 Billing Start
 * 
 * 
 * 
 * 09/01 Kona files (contains Branch A)
 * 
 * 
 * Deleted Branch A + STOP metering message sent
 * 
 * 09/26 Generated Invalid ARNs based on Branche DDB --> invalid ARNS = ARNS not longer exist in DB
 * 
 * 09/28 RemoSnapshot -> branchARNs + storagePrefix currently active 
 */


const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Generates a list of branch arns that should not have been billed
ts-node billingAuditor.ts --stage prod --region ap-northeast-2 --konaFile "konafiles/2022-09-01" --startDate "2022-08-01T00:00:00" --invalidArnsFile "artifacts/invalidArns-ap-northeast-2" --outDir "1"
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
    .option("outDir", {
      describe: "path to output directory",
      type: "string",
      demandOption: false,
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

  let { konaFile, outDir, stage, region, startDate } = args;
  if (!outDir) {
    outDir = "out";
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const account = await controlPlaneAccount(stage as Stage, region as Region);

  const billedArnsFileStream = fs.createWriteStream(
    path.join(process.cwd(), outDir, `${account.region}-billedArns.txt`),
    { flags: "a" }
  );

  const billedArns = await getResourcesBilled(account, konaFile);

  for (const arn of billedArns) {
    billedArnsFileStream.write(arn + "\n");
  }
  billedArnsFileStream.close();

  const deletedBranchArnsSinceBillingMonth =
    (await getDeletedPartialBranchArns(
      stage,
      region,
      new Date(startDate),
      new Date()
    )) || [];

  const deletedBranchArnsSinceBillingMonthFileStream = fs.createWriteStream(
    path.join(
      process.cwd(),
      outDir,
      `${account.region}-deletedBranchSinceBillingMonth.txt`
    ),
    { flags: "a" }
  );

  for (const arn of deletedBranchArnsSinceBillingMonth) {
    deletedBranchArnsSinceBillingMonthFileStream.write(arn + "\n");
  }
  deletedBranchArnsSinceBillingMonthFileStream.close();


  const dynamodb = await getDDbClient(account);

  const branchArnsNotDeletedBeforeBilling = [];
  for (const billedBranchArn of billedArns) {
    if (
      deletedBranchArnsSinceBillingMonth.find((arn) =>
        billedBranchArn.includes(arn)
      )
    ) {
      console.log(
        billedBranchArn +
          " => ✅ valid bill: branch deleted during/after the billing month"
      );
      continue;
    }

    branchArnsNotDeletedBeforeBilling.push(billedBranchArn);
  }

  const invalidArnsFileStream = fs.createWriteStream(
    path.join(process.cwd(), outDir, `${account.region}-invalidBilledArns.txt`),
    {
      flags: "a",
    }
  );

  for (const billedArnsBatch of new BatchIterator(
    branchArnsNotDeletedBeforeBilling,
    50
  )) {
    const dbBatchResponse = await getBranchesByArns(
      dynamodb,
      Array.from(new Set(billedArnsBatch)), // naive deduping
      account.region
    );

    const branchArnsInDb = dbBatchResponse.map((res) => res.branchArn.S);
    for (const arn of billedArnsBatch) {
      // branch not found in db
      if (!branchArnsInDb.includes(arn)) {
        invalidArnsFileStream.write(arn + "\n");
      }
    }
  }

  invalidArnsFileStream.close();
};

async function getDDbClient(account: AmplifyAccount, role = "ReadOnly") {
  const credentials = getIsengardCredentialsProvider(account.accountId, role);
  const dynamodbClient = new DynamoDBClient({
    region: account.region,
    credentials,
  });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

export async function getBranchesByArns(
  db: DynamoDBDocumentClient,
  branchArns: string[],
  region: string
) {
  const keys = branchArns
    .map((arn) => parseBranchArn(arn))
    .map(({ appId, branch }) => ({
      appId: {
        S: appId,
      },
      branchName: {
        S: branch,
      },
    }));

  const table = `prod-${region}-Branch`;
  const params: BatchGetItemCommandInput = {
    RequestItems: {
      [table]: {
        Keys: keys,
        ProjectionExpression: "branchArn",
      },
    },
  };
  const result = await db.send(new BatchGetItemCommand(params));
  if (!result.Responses) {
    console.info("Db returned no response for keys: ", keys);
    return [];
  }

  if (
    result.UnprocessedKeys &&
    Object.keys(result.UnprocessedKeys).length > 0
  ) {
    console.error(result.UnprocessedKeys);
    throw new Error("Db returned unprocessed keys");
  }

  return result.Responses[table] as { branchArn: { S: string } }[];
}

/**
 *
 * @returns partial branchArn of the form ${appId}/branches/${branchName}
 */
async function getDeletedPartialBranchArns(
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
| parse arn "*/*/*" as appId, branch, jobId
| display concat(appId,"/branches/",branch) as branchArn
| limit 10000
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
  const arnsBilled: string[] = [];

  const arnRegionPrefix = `arn:aws:amplify:${account.region}:`;

  const konaFileReader = new KonaFileReader(konaFile);
  await konaFileReader.readLines((_, { resource }) => {
    if (resource.startsWith(arnRegionPrefix)) {
      arnsBilled.push(resource);
    }
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
