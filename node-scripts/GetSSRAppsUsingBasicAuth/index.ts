
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getAccount, getArg, getArgs, getRegion, getStage } from "../P61637409/helpers";
import { mkdirSync, writeFileSync } from "fs";
import Isengard from "../utils/isengardCreds";
import { exhaustiveScan } from "../P61637409/helpers/dynamo-util";

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

const getAction = (args: string[]) => {
    const action = getArg("action", args);
    if (!["get-impact"].includes(action)) {
        throw new Error(`Invalid action provided: ${action}`);
    }
    return action;
};

const getAppsUsingBasicAuthAndSSR = async (
    tableName: string,
    ddbClient: DynamoDBDocumentClient
) => {
    const scan = new ScanCommand({
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
    });

    const items = await exhaustiveScan(scan, ddbClient);

    if (items.length < 1) {
        return [];
    }

    return items as App[];
};

const getReadOnlyCredentials = async (accountId: string, stage: string) => {
    // ** USE READ ONLY ROLE **
    const roleName = stage === "prod" ? "ReadOnly" : "Admin";
    const credentials = await Isengard.getCredentials(accountId, roleName);

    if (!credentials) {
        throw new Error("Failed to get isengard creds");
    }

    return credentials;
};

async function run() {
    const args = getArgs();
    const region = getRegion(args);
    const stage = getStage(args);
    const action = getAction(args);
    const account = getAccount(region, stage);
    const { accountId } = account;
    console.log('search input')
    console.log({ region, stage, action, accountId });

    console.log('setup ReadOnly Credentials')
    const credentials = await getReadOnlyCredentials(accountId, stage);

    const tableName = `${stage}-${region}-App`;
    console.log(`scanning table: ${tableName}`)
    const ddb = new DynamoDBClient({
        region,
        credentials: {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
            expiration: new Date(credentials.expiration),
        },
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
