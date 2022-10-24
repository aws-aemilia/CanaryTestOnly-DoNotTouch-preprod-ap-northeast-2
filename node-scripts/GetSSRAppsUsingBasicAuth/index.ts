
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, paginateScan, ScanCommandInput } from "@aws-sdk/lib-dynamodb";
import { mkdirSync, writeFileSync } from "fs";
import { controlPlaneAccount, getIsengardCredentialsProvider, Region, Stage } from "../Isengard";
import yargs from "yargs";

export interface Credentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: number;
}

export interface App {
    appId: string;
    accountId: string;
}

const getAppsUsingBasicAuthAndSSR = async (
    tableName: string,
    ddbClient: DynamoDBDocumentClient
) => {
    const scanCommandInput: ScanCommandInput = {
        TableName: tableName,
        ProjectionExpression:
            "appId,accountId,basicAuthCreds,basicAuthCredsV2,autoBranchCreationConfig,platform",
        ExpressionAttributeValues: {
            ":ssr": "WEB_DYNAMIC"
        },
        FilterExpression:
            "(attribute_exists(basicAuthCreds) OR attribute_exists(basicAuthCredsV2) OR " +
            "attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCreds) OR " +
            'attribute_exists(autoBranchCreationConfig.branchConfig.basicAuthCredsV2)) AND platform = :ssr',
    };

    let items = [];
    for await (const page of paginateScan(
        { client: ddbClient },
        scanCommandInput
    )) {
        items.push(...(page.Items || []));
    }

    if (items.length < 1) {
        return [];
    }

    return items as App[];
};

async function run() {

    const args = await yargs(process.argv.slice(2))
        .usage(
            `
This tool will scan the App table for a given region for apps that use SSR and Basic Auth.
It will then write the accountIds for the owners of these apps to "GetSSRAppsUsingBasicAuth/output"
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
        .strict()
        .version(false)
        .help().argv;

    const { region, stage} = args
    const account = await controlPlaneAccount(stage as Stage, region as Region)
    const { accountId } = account;
    console.log('search input')
    console.log({ region, stage, accountId });

    const tableName = `${stage}-${region}-App`;
    console.log(`scanning table: ${tableName}`)
    const ddb = new DynamoDBClient({
        region: account.region,
        credentials: getIsengardCredentialsProvider(accountId),
    });
    const ddbClient = DynamoDBDocumentClient.from(ddb);
    const apps = await getAppsUsingBasicAuthAndSSR(tableName, ddbClient);
    const accountIds: String[] = [];
    for (const app of apps) {
        accountIds.push(app.accountId);
    }

    console.log(`DONE... Writing output to: GetSSRAppsUsingBasicAuth/output/${stage}/${region}`)
    mkdirSync(`GetSSRAppsUsingBasicAuth/output/${stage}/${region}`, {
        recursive: true,
    });
    writeFileSync(
        `GetSSRAppsUsingBasicAuth/output/${stage}/${region}/${tableName}.json`,
        JSON.stringify(accountIds),
        "utf8"
    );
}

run()
    .then(() => {
        console.log("Completed search");
    })
    .catch((e) => {
        console.error("Error migrating", e);
    });
