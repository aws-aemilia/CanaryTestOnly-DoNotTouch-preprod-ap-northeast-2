import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient, QueryCommand, ScanCommand, GetCommand
} from "@aws-sdk/lib-dynamodb";
import { writeFileSync } from 'fs';
import { getIsengardCredentialsProvider } from '../Isengard/credentials';
import { LambdaEdgeConfig, InvalidApps, BranchItem, DomainItem } from './types';
import { AmplifyAccount } from "../types";
import sleep from "../utils/sleep";
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
import yargs from "yargs";

const accounts: AmplifyAccount[] = [
    { region: "eu-west-2", accountId: "499901155257" },
    { region: "us-east-2", accountId: "264748200621" },
    { region: "ap-southeast-1", accountId: "148414518837" },
    { region: "eu-west-1", accountId: "565036926641" },
    { region: "us-east-1", accountId: "073653171576" },
    { region: "ap-northeast-1", accountId: "550167628141" },
    { region: "ap-northeast-2", accountId: "024873182396" },
    { region: "ap-south-1", accountId: "801187164913" },
    { region: "ap-southeast-2", accountId: "711974673587" },
    { region: "eu-central-1", accountId: "644397351177" },
    { region: "us-west-2", accountId: "395333095307" },
    { region: "ca-central-1", accountId: "824930503114" },
    { region: "eu-north-1", accountId: "315276288780" },
    { region: "eu-west-3", accountId: "693207358157" },
    { region: "sa-east-1", accountId: "068675532419" },
    { region: "us-west-1", accountId: "214290359175" },
    { region: "eu-south-1", accountId: "804516649577" },
    { region: "ap-east-1", accountId: "574285171994" },
    { region: "me-south-1", accountId: "183380703454" },
  ];

  const fs = require('fs');

  // This script reads all the files in a directory by name "AppIds"
  // The name of the file should be "region".csv
  // Each line should contain the appId of the SSR app being tested
  // Output is printed in a directory called "MisMatchedCustomDomains"
async function readFileAndGetAppsWithInvalidCustomDomains(srcDir: string) {
    const args = await yargs(process.argv.slice(2))
    .usage("Detect and possibly mitigate ssr distribution mismatch between app and custom domain")
    .option("dryrun", {
      describe: "true for readOnly false otherwise",
      type: "string",
      default: "true",
      choices: ["true", "false"],
    })
    .strict()
    .version(false)
    .help().argv;

    const skipUpdate = args.dryrun;

    console.log(`Script will update the Apps?: ${skipUpdate} `)

    const allFiles = fs.readdirSync(srcDir);
    let allMismatchedAppAndCustomDomains: InvalidApps[] = [];

    if(!fs.existsSync('P71985437/MisMatchedCustomDomains')) {
        fs.mkdirSync('P71985437/MisMatchedCustomDomains');
    }

    for (const file of allFiles) {

        // Parse region and get credentials
        const region = file.split(".")[0].toString();
        console.log(region);
        const accountConfig = accounts.find(acc => acc.region === region);
        if (!accountConfig) {
            throw new Error("Failed to get isengard creds");
        }

        // Read all the appIds for that region
        const allFileContents = fs.readFileSync(`${srcDir}/${file}`, 'utf-8');
        const appIds = allFileContents.split(/\r?\n/);
        let mismatchedAppAndCustomDomains: InvalidApps[] = [];

        const edgeObjectsByAppId = new Map<string, LambdaEdgeConfig>();
        const branchesByAppId = new Map<string, BranchItem[]>();
        const domainsByAppId = new Map<string, DomainItem[]>();

        // For every AppId, check if it is tainted or not
        for (const appId of appIds) {
            if (appId.includes('applicationId')) {
                continue;
            }

            const ddbClient = new DynamoDBClient({ region: region, credentials: getIsengardCredentialsProvider(accountConfig.accountId, "ReadOnly") });
            const dynamodb = DynamoDBDocumentClient.from(ddbClient);

            const mismatchedApps = await getMisMatchedCustomDomains(dynamodb, 'prod', region, appId, edgeObjectsByAppId, branchesByAppId, domainsByAppId, skipUpdate);
            if (mismatchedApps.length) {
                mismatchedAppAndCustomDomains = [...mismatchedAppAndCustomDomains, ...mismatchedApps]
            }
        }

        const outputFileName = `P71985437/MisMatchedCustomDomains/${file}`

        writeFile(outputFileName, mismatchedAppAndCustomDomains)

        if (mismatchedAppAndCustomDomains.length) {
            allMismatchedAppAndCustomDomains = [...allMismatchedAppAndCustomDomains, ...mismatchedAppAndCustomDomains]
        }
    }
    const outputFileName = `P71985437/MisMatchedCustomDomains/ALL_REGIONS.csv`
    writeFile(outputFileName, allMismatchedAppAndCustomDomains)
}

async function getMisMatchedCustomDomains(
    dynamodb: DynamoDBDocumentClient, 
    stage: string, 
    region: string, 
    appId: string,
    edgeObjectsByAppId: Map<string, LambdaEdgeConfig>,
    branchesByAppId: Map<string, BranchItem[]>,
    domainsByAppId: Map<string, DomainItem[]>,
    skipUpdate:boolean): Promise<InvalidApps[]> {

    const appConfig = await getEdgeConfig(dynamodb, appId, edgeObjectsByAppId);

    if (!appConfig?.customDomainIds || !appConfig?.customDomainIds.size) {
        return []
    }
    let invalidApps : InvalidApps[] = [];

    console.log(`App : ${appConfig.appId} does have a custom domain`)

    const customDomains = await getDomains(dynamodb, stage, region, appId, domainsByAppId);

    if(!customDomains) {
        console.log(`Unexpected App: ${appConfig.appId} Unable to find Custom Domain for appid: ${appId}`)
        return []
    }

    const hostNameConfigs = Object.entries(appConfig.hostNameConfig as Object);

    for (const hostNameConfig of hostNameConfigs) {
        const domainId = getDomainId(customDomains, hostNameConfig[0])
        if (!domainId) {
            console.log(`Unexpected App: ${appConfig.appId} Unable to find domainId for hostName: ${hostNameConfig[0]}`)
            continue
        }

        const customDomainConfig = await getEdgeConfig(dynamodb, domainId, edgeObjectsByAppId);

        if (!customDomainConfig) {
            console.log(`Unexpected App: ${appConfig.appId} Unable to find L@E object for domainId: ${domainId}`)
            continue
        }

        const branches = await getBranch(dynamodb, stage, region, appConfig.appId, branchesByAppId);

        const targetBranchName = hostNameConfig[1].targetBranch as string;

        const branch = getBranchForApp(targetBranchName, branches as BranchItem[]);

        if(!branch) {
            console.log(`Unexpected App: ${appConfig.appId} Unable to find branch object for branchName: ${targetBranchName}`)
            continue;
        }

        const appBranchNameInBranchConfig = appConfig.branchConfig?.[branch.displayName] ? branch.displayName : branch.branchName;

        if(!appConfig.branchConfig?.[appBranchNameInBranchConfig]) {
            console.log(`Unexpected App: ${appConfig.appId} Unable to find branch Config for branchName: ${targetBranchName}`);
            continue
        }

        if (appConfig.branchConfig?.[appBranchNameInBranchConfig].ssrDistributionId !== customDomainConfig?.branchConfig?.[appBranchNameInBranchConfig]?.ssrDistributionId) {
            invalidApps.push({
                appId: appConfig.appId,
                customDomainId: customDomainConfig.appId,
                branch:appBranchNameInBranchConfig
            });
            console.log(`ERROR: Mismatch in ssrDistribution for app: ${appConfig.appId} and custom domain : ${customDomainConfig.appId}`);
            if(!skipUpdate) {
                await updateCustomDomainConfigFromAppConfig(dynamodb, appConfig, customDomainConfig);
            }
        }
    }

    return invalidApps;
}

async function getDomains(dynamodb: DynamoDBDocumentClient, stage: string, region: string, appId: string, domainsByAppId: Map<string, DomainItem[]>) {
    if(domainsByAppId.has(appId)) {
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

async function updateCustomDomainConfigFromAppConfig(dynamodb: DynamoDBDocumentClient, appConfig: LambdaEdgeConfig, customDomainConfig: LambdaEdgeConfig) {
 // TODO: Update CustomDomainConfig from AppConfig without downloading customer data
}

async function getBranch(dynamodb: DynamoDBDocumentClient, stage: string, region: string, appId: string, branchesByAppId: Map<string, BranchItem[]>) {
    if(branchesByAppId.has(appId)) {
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

async function getEdgeConfig(dynamodb: DynamoDBDocumentClient, appId: string, edgeObjectsByAppId: Map<string, LambdaEdgeConfig>): Promise<LambdaEdgeConfig | undefined> {
    if(edgeObjectsByAppId.has(appId)) {
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
     console.log("L@E not found");
      return undefined;
    }

    const lambdaEdgeObject = {
        appId: item.Item.appId,
        config: item.Item.config,
        branchConfig: item.Item.branchConfig,
        customDomainIds: item.Item.customDomainIds,
        hostNameConfig: item.Item.hostNameConfig
    };

    edgeObjectsByAppId.set(appId, lambdaEdgeObject);

    return lambdaEdgeObject;
}

function getDomainId(customDomains: DomainItem[], fullDomainName: string): string | undefined{
    const domainId = customDomains.find(customDomain => customDomain.domainName === fullDomainName || fullDomainName.endsWith(`.${customDomain.domainName}`));
    return domainId?.domainId;
}

function getBranchForApp(branchName: string, allBranchesForApp: BranchItem[]): BranchItem | undefined{
    return allBranchesForApp.find(branches => branches.branchName === branchName);
}

function writeFile(outputFile: string, data: InvalidApps[]){
    writeFileSync(outputFile, '', {
        flag: 'w'
    });
    const csvWriter = createCsvWriter({
        path: outputFile,
        header: [
            { id: 'appId', title: 'appId' },
            { id: 'customDomainId', title: 'customDomainId' },
            { id: 'branch', title: 'branch' },
        ],
        append: false
    });
    csvWriter.writeRecords(data).then(console.log(`Wrote ${data.length} records`));
}

readFileAndGetAppsWithInvalidCustomDomains('P71985437/AppIds')