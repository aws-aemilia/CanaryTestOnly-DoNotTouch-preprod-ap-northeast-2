import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { writeFileSync } from "fs";
import { getIsengardCredentialsProvider } from "../Isengard/credentials";
import { BranchItem, DomainItem, InvalidApps, LambdaEdgeConfig } from "./types";
import sleep from "../utils/sleep";
import yargs from "yargs";
import {
  AmplifyAccount,
  controlPlaneAccount,
  Region,
  Stage,
} from "../Isengard";

const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const fs = require("fs");

let numberOfUpdatedApps = 0;
const maxNumberOfUpdatedApps = 5;

// This script reads all the files in a directory by name "AppIds"
// The name of the file should be "region".csv
// Each line should contain the appId of the SSR app being tested
// Output is printed in a directory called "MisMatchedCustomDomains"
async function readFileAndGetAppsWithInvalidCustomDomains(
  srcDir: string,
  controlPlaneAccount: AmplifyAccount,
  bucketName: string,
  writeModeOn = false,
) {
  console.log(`Script will update the Apps?: ${writeModeOn} `);

  const allFiles = fs.readdirSync(srcDir);
  let allMismatchedAppAndCustomDomains: InvalidApps[] = [];

  if (!fs.existsSync("P71985437/MisMatchedCustomDomains")) {
    fs.mkdirSync("P71985437/MisMatchedCustomDomains");
  }

  const ddbClient = new DynamoDBClient({
    region: controlPlaneAccount.region,
    credentials: getIsengardCredentialsProvider(
        controlPlaneAccount.accountId,
        "OncallOperator"
    ),
  });

  const dynamodb = DynamoDBDocumentClient.from(ddbClient);
 
  for (const file of allFiles) {
    const regionFromFile = file.split(".")[0].toString();
    console.log("found file for region:", regionFromFile);

    if (regionFromFile !== controlPlaneAccount.region) {
      throw new Error("The input files do not match the region parameter");
    }

    var s3 = new S3Client({region: regionFromFile, credentials: getIsengardCredentialsProvider(
        controlPlaneAccount.accountId,
        "OncallOperator"
    )});

    // Read all the appIds for that region
    const allFileContents = fs.readFileSync(`${srcDir}/${file}`, "utf-8");
    const appIds = allFileContents.split(/\r?\n/);
    let mismatchedAppAndCustomDomains: InvalidApps[] = [];

    const edgeObjectsByAppId = new Map<string, LambdaEdgeConfig>();
    const branchesByAppId = new Map<string, BranchItem[]>();
    const domainsByAppId = new Map<string, DomainItem[]>();

    // For every AppId, check if it is tainted or not
    for (const appId of appIds) {
      if ((appId as String).length === 0){
        // skip empty lines
        continue;
      }

      if(numberOfUpdatedApps >= maxNumberOfUpdatedApps) {
          break;
      }

      if (appId.includes("applicationId")) {
        continue;
      }
      console.log("AppId:", appId);

      const mismatchedApps = await getMisMatchedCustomDomains(
        dynamodb,
        controlPlaneAccount.stage,
        controlPlaneAccount.region,
        appId,
        edgeObjectsByAppId,
        branchesByAppId,
        domainsByAppId,
        writeModeOn,
        s3,
        bucketName
      );
      if (mismatchedApps.length) {
        mismatchedAppAndCustomDomains = [
          ...mismatchedAppAndCustomDomains,
          ...mismatchedApps,
        ];
      }
    }

    // Write to region specific files
    const outputFileName = `P71985437/MisMatchedCustomDomains/${file}`;

    writeFile(outputFileName, mismatchedAppAndCustomDomains);

    if (mismatchedAppAndCustomDomains.length) {
      allMismatchedAppAndCustomDomains = [
        ...allMismatchedAppAndCustomDomains,
        ...mismatchedAppAndCustomDomains,
      ];
    }
  }
  // write to aggregate file
  const outputFileName = `P71985437/MisMatchedCustomDomains/ALL_REGIONS.csv`;
  
  writeFile(outputFileName, allMismatchedAppAndCustomDomains);
}

async function getMisMatchedCustomDomains(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  edgeObjectsByAppId: Map<string, LambdaEdgeConfig>,
  branchesByAppId: Map<string, BranchItem[]>,
  domainsByAppId: Map<string, DomainItem[]>,
  writeModeOn: boolean,
  s3: any,
  bucketName: string
): Promise<InvalidApps[]> {
  const appConfig = await getEdgeConfig(dynamodb, appId, edgeObjectsByAppId);

  if (!appConfig){
    console.error(`WARNING: App ${appId} was not found in LambdaEdgeConfig. Either the App was deleted or the input file is wrong`)
  }


  if (!appConfig?.customDomainIds || !appConfig?.customDomainIds.size) {
    return [];
  }
  let invalidApps: InvalidApps[] = [];

  // Steps:
  // 1) Get LambdaEdge config of AppId, early return if it doesn't have custom domain
  // 2) Get CustomDomain object, and BranchObject to map BranchName -> CustomDmainId
  // 3) Get LambdaEdge config of CustomDomain, use branchName to access branch config and verify ssrDistributionId

  console.log(`App : ${appConfig.appId} does have a custom domain`);

  const customDomains = await getDomains(
    dynamodb,
    stage,
    region,
    appId,
    domainsByAppId
  );

  if (!customDomains) {
    console.log(
      `Unexpected App: ${appConfig.appId} Unable to find Custom Domain for appid: ${appId}`
    );
    return [];
  }

  const hostNameConfigs = Object.entries(appConfig.hostNameConfig as Object);

  for (const hostNameConfig of hostNameConfigs) {
    const domainId = getDomainId(customDomains, hostNameConfig[0]);
    if (!domainId) {
      console.log(
        `Unexpected App: ${appConfig.appId} Unable to find domainId for hostName: ${hostNameConfig[0]}`
      );
      continue;
    }

    const customDomainConfig = await getEdgeConfig(
      dynamodb,
      domainId,
      edgeObjectsByAppId,
      true
    );

    if (!customDomainConfig) {
      console.log(
        `Unexpected App: ${appConfig.appId} Unable to find L@E object for domainId: ${domainId}`
      );
      continue;
    }

    const branches = await getBranch(
      dynamodb,
      stage,
      region,
      appConfig.appId,
      branchesByAppId
    );

    const targetBranchName = hostNameConfig[1].targetBranch as string;

    const branch = getBranchForApp(targetBranchName, branches as BranchItem[]);

    if (!branch) {
      console.log(
        `Unexpected App: ${appConfig.appId} Unable to find branch object for branchName: ${targetBranchName}`
      );
      continue;
    }

    const appBranchNameInBranchConfig = appConfig.branchConfig?.[
      branch.displayName
    ]
      ? branch.displayName
      : branch.branchName;

    if (!appConfig.branchConfig?.[appBranchNameInBranchConfig]) {
      console.log(
        `Unexpected App: ${appConfig.appId} Unable to find branch Config for branchName: ${targetBranchName}`
      );
      continue;
    }

    const branchConfigFromApp =
      appConfig.branchConfig?.[appBranchNameInBranchConfig];
    const ssrIdKey = "ssrDistributionId" as keyof typeof branchConfigFromApp;

    if (!branchConfigFromApp) {
      console.log(
        `Unexpected App: ${appConfig.appId} Unable to find branchConfig for branchName: ${targetBranchName}`
      );
      continue;
    }

    const branchConfigFromCustomDomain =
      customDomainConfig?.branchConfig?.[appBranchNameInBranchConfig];
    const ssrIdKeyForCustomDomain =
      "ssrDistributionId" as keyof typeof branchConfigFromApp;

    if (!branchConfigFromCustomDomain) {
      console.log(
        `Unexpected CustomDomain: ${domainId} Unable to find ssrDistributionId for branchName: ${targetBranchName}`
      );
      continue;
    }

    if (
      branchConfigFromApp[ssrIdKey] !==
      branchConfigFromCustomDomain[ssrIdKeyForCustomDomain]
    ) {
      invalidApps.push({
        appId: appConfig.appId,
        customDomainId: customDomainConfig.appId,
        branch: appBranchNameInBranchConfig,
        updateTime: appConfig.updateTime
      });
      console.log(
        `ERROR: Mismatch in ssrDistribution for app: ${appConfig.appId} and custom domain : ${customDomainConfig.appId}`
      );
      await updateCustomDomainConfigFromAppConfig(
        dynamodb,
        appConfig,
        customDomainConfig,
        writeModeOn,
        s3,
        bucketName
      );

      numberOfUpdatedApps = numberOfUpdatedApps + 1;
    }
  }

  return invalidApps;
}

async function getDomains(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  domainsByAppId: Map<string, DomainItem[]>
) {
  if (domainsByAppId.has(appId)) {
    return domainsByAppId.get(appId);
  }
  const domainsTableName = `${stage}-${region}-Domain`;
  await sleep(100);
  const domains = await dynamodb.send(
    new QueryCommand({
      TableName: domainsTableName,
      KeyConditionExpression: "appId = :appId",
      ExpressionAttributeValues: {
        ":appId": appId,
      },
    })
  );

  domainsByAppId.set(appId, domains.Items as DomainItem[]);
  return domains.Items as DomainItem[];
}

async function updateCustomDomainConfigFromAppConfig(
  dynamodb: DynamoDBDocumentClient,
  appConfig: LambdaEdgeConfig,
  customDomainConfig: LambdaEdgeConfig,
  writeModeOn: boolean,
  s3:any,
  bucketName: string
) {
  //console.log("ORIGINAL App Config:"+JSON.stringify(appConfig))
  //console.log("\n")
  //console.log("ORIGINAL Custom Domain Config:"+ JSON.stringify(customDomainConfig))
  //console.log("\n")

  const date = new Date();

  const keySuffix =  date.toLocaleDateString()+"/"+date.getHours()+"/"+date.getMinutes();
  // Write Original
  if(writeModeOn) {
    await writeToS3(customDomainConfig, customDomainConfig.appId + "/original/" + keySuffix, s3, bucketName)
  }

  customDomainConfig = {
    appId: customDomainConfig.appId,
    config: appConfig.config,
    hostNameConfig: appConfig.hostNameConfig,
    branchConfig: appConfig.branchConfig,
    customRuleConfigs: appConfig.customRuleConfigs,
    originKey: appConfig.originKey,
    updateTime: customDomainConfig.updateTime
    //customDomainIds: customDomainConfig.customDomainIds
  };

  //console.log("UPDATED Custom Domain Config:"+ JSON.stringify(customDomainConfig))
  //console.log("\n")
  if (writeModeOn) {
    // console.log("ORIGINAL App Config:"+JSON.stringify(appConfig, null, 2))
    // console.log("\n")
    // console.log("ORIGINAL Custom Domain Config:"+ JSON.stringify(customDomainConfig, null, 2))
    // console.log("\n")
    await updateCustomDomainConfig(dynamodb, customDomainConfig);
    await writeToS3(customDomainConfig, customDomainConfig.appId + "/updated/" + keySuffix, s3, bucketName)
  }
}

async function getBranch(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  branchesByAppId: Map<string, BranchItem[]>
) {
  if (branchesByAppId.has(appId)) {
    return branchesByAppId.get(appId);
  }
  const branchTableName = `${stage}-${region}-Branch`;
  await sleep(100);
  const branches = await dynamodb.send(
    new QueryCommand({
      TableName: branchTableName,
      KeyConditionExpression: "appId = :appId",
      ExpressionAttributeValues: {
        ":appId": appId,
      },
    })
  );

  branchesByAppId.set(appId, branches.Items as BranchItem[]);
  return branches.Items as BranchItem[];
}

async function writeToS3(
    data: LambdaEdgeConfig,
    keySuffix: string,
    s3: any,
    bucketName: string
  ) {
    const bucketParams = {
        Bucket: bucketName,
        // Specify the name of the new object. For example, 'index.html'.
        // To create a directory for the object, use '/'. For example, 'myApp/package.json'.
        Key: "customdomains_mismatch/"+keySuffix,
        // Content of the new object.
        Body: Buffer.from(JSON.stringify(data)),
      };
    try {
        const data = await s3.send(new PutObjectCommand(bucketParams));
        console.log(
            "Successfully uploaded object: " +
              bucketParams.Bucket +
              "/" +
              bucketParams.Key
          );
        return data;
      } catch (err) {
        console.log("Error", err);
      }
  }

async function getEdgeConfig(
  dynamodb: DynamoDBDocumentClient,
  appId: string,
  edgeObjectsByAppId: Map<string, LambdaEdgeConfig>,
  skipCache = false
): Promise<LambdaEdgeConfig | undefined> {

  if (!skipCache && edgeObjectsByAppId.has(appId)) {
    return edgeObjectsByAppId.get(appId);
  }

  await sleep(100);
  const item = await dynamodb.send(
    new GetCommand({
      TableName: "LambdaEdgeConfig",
      Key: {
        appId: appId.trim(),
      },
    })
  );

  if (!item.Item) {
    return undefined;
  }

  const lambdaEdgeObject = {
    appId: item.Item.appId,
    config: item.Item.config,
    branchConfig: item.Item.branchConfig,
    customDomainIds: item.Item.customDomainIds,
    hostNameConfig: item.Item.hostNameConfig,
    originKey: item.Item.originKey,
    updateTime: item.Item.updateTime
  };

  edgeObjectsByAppId.set(appId, lambdaEdgeObject);

  return lambdaEdgeObject;
}

async function updateCustomDomainConfig(
  dynamodb: DynamoDBDocumentClient,
  customDomainConfig: LambdaEdgeConfig
) {
  const appId = customDomainConfig.appId;
  //console.log(`APPID: ${appId}`)
  const params = {
    TableName: "LambdaEdgeConfig",
    Key: {
      appId: appId,
    },
    ExpressionAttributeValues: {
      ":config": customDomainConfig.config,
      ":branchConfig": customDomainConfig.branchConfig,
      ":hostNameConfig": customDomainConfig.hostNameConfig,
      ":originKey": customDomainConfig.originKey,
      ":customRuleConfigs": customDomainConfig.customRuleConfigs
    },
    UpdateExpression:
      "set config = :config, hostNameConfig = :hostNameConfig, branchConfig = :branchConfig, customRuleConfigs=:customRuleConfigs, originKey=:originKey"
  };
  await sleep(100);
  await dynamodb.send(new UpdateCommand(params));
}

function getDomainId(
  customDomains: DomainItem[],
  fullDomainName: string
): string | undefined {
  const domainId = customDomains.find(
    (customDomain) =>
      customDomain.domainName === fullDomainName ||
      fullDomainName.endsWith(`.${customDomain.domainName}`)
  );
  return domainId?.domainId;
}

function getBranchForApp(
  branchName: string,
  allBranchesForApp: BranchItem[]
): BranchItem | undefined {
  return allBranchesForApp.find(
    (branches) => branches.branchName === branchName
  );
}

function isForLocalStack(fileName: string): boolean {
  return fileName.split(".")[0].toString() === "test";
}

function writeFile(outputFile: string, data: InvalidApps[]) {
  writeFileSync(outputFile, "", {
    flag: "w",
  });
  const csvWriter = createCsvWriter({
    path: outputFile,
    header: [
      { id: "appId", title: "appId" },
      { id: "customDomainId", title: "customDomainId" },
      { id: "branch", title: "branch" },
    ],
    append: false,
  });

  csvWriter
    .writeRecords(data)
    .then(console.log(`Wrote ${data.length} records`));
}

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Detect and possibly mitigate ssr distribution mismatch between app and custom domain"
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
    .option("writeModeOn", {
      describe:
        "When enabled, The script will update the records in DDB to fix them",
      type: "boolean",
      default: false,
    })
    .option("bucket", {
        describe:
          "s3 bucket to for storing audit records",
        type: "string",
        demandOption: true,
      })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, writeModeOn, bucket } = args;

  const account = await controlPlaneAccount(stage as Stage, region as Region);

  console.log("Using account:", account.accountId, account.email);

  await readFileAndGetAppsWithInvalidCustomDomains(
    "P71985437/AppIds",
    account,
    bucket,
    writeModeOn
  );
};

main().then(console.log).catch(console.error);