import { BatchGetItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient, QueryCommand
} from "@aws-sdk/lib-dynamodb";
import { LambdaEdgeConfig } from './P61637409/types';

interface DomainItem {
    "appId": string,
    "domainName": string,
    "certificateVerificationRecord": string,
    "createTime": string,
    "distributionId": string,
    "domainId": string,
    "domainType": string,
    "enableAutoSubDomain": number,
    "status": string,
    "updateTime": string,
    "version": number
}

async function findAllCustomDomainEdgeConfigIds(stage: string, region: string, appId: string) {
    const ddbClient = new DynamoDBClient({ region });

    const dynamodb = DynamoDBDocumentClient.from(ddbClient);

    const domains = await getDomains(dynamodb, stage, region, appId);
    console.log(domains.length);

    const edgeConfigs = await getEdgeConfig(dynamodb, domains.map(d => d.domainId));
    console.log(JSON.stringify(edgeConfigs));
    // console.log(edgeConfigs?.map(c => c.branchConfig));
}

async function getDomains(dynamodb: DynamoDBDocumentClient, stage: string, region: string, appId: string) {
    const domainsTableName = `${stage}-${region}-Domain`;
    console.log("Looking for custom domain distributions");
    const domains = await dynamodb.send(
        new QueryCommand({
            TableName: domainsTableName,
            KeyConditionExpression: "appId = :appId",
            ExpressionAttributeValues: {
                ":appId": appId,
            },
        })
    );

    return domains.Items as DomainItem[];
}

async function getEdgeConfig(dynamodb: DynamoDBDocumentClient, appIds: string[]): Promise<LambdaEdgeConfig[] | undefined> {
    console.log("Looking for EdgeConfigs for domains: " + appIds);
    const edgeConfigs = await dynamodb.send(
        new BatchGetItemCommand({
            RequestItems: {
                'LambdaEdgeConfig': {
                    Keys: [
                        ...appIds.map(appId => ({
                            'appId': { S: appId }
                        }))
                    ]
                }
            }
        })
    );

    return edgeConfigs.Responses?.LambdaEdgeConfig as unknown as LambdaEdgeConfig[];
}

findAllCustomDomainEdgeConfigIds('prod', 'eu-central-1', 'ddgrnop6ksu96');