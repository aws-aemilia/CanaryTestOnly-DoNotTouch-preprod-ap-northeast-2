import { CloudFront, DistributionConfig } from "@aws-sdk/client-cloudfront";
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

export async function fetchDistribution(
    cloudfront: CloudFront,
    distributionId: string
): Promise<{
    eTag: string;
    distributionConfig: DistributionConfig;
}> {
    console.log("Fetching distribution", distributionId);
    const response = await cloudfront.getDistribution({
        Id: distributionId,
    });

    if (!response.Distribution || !response.ETag) {
        throw new Error(`"Distribution ${distributionId} not found"`);
    }

    if (!response.Distribution.DistributionConfig) {
        throw new Error(`"Distribution ${distributionId} not found"`);
    }

    return {
        eTag: response.ETag,
        distributionConfig: response.Distribution.DistributionConfig,
    };
}

export async function getDistributionsForApp(
    dynamodb: DynamoDBDocumentClient,
    stage: string,
    region: string,
    appId: string
): Promise<string[]> {
    const distributions = [];
    const appTableName = `${stage}-${region}-App`;
    console.log("Looking for app distributions");
    const app = await dynamodb.send(
        new GetCommand({
            TableName: appTableName,
            Key: {
                appId: appId,
            },
        })
    );

    if (!app.Item) {
        throw new Error(`AppId ${appId} not found in table ${appTableName}`);
    }

    if (app.Item.cloudFrontDistributionId) {
        console.log(
            "Found default distribution",
            app.Item.cloudFrontDistributionId
        );
        distributions.push(app.Item.cloudFrontDistributionId);
    }

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

    if (domains.Items) {
        if (domains.Items.length === 0) {
            console.log("No custom domains found");
        }

        domains.Items.forEach(({ distributionId, domainName }) => {
            if (distributionId) {
                console.log(`Found domain ${domainName} with distro ${distributionId}`);
                distributions.push(distributionId);
            }
        });
    }

    return distributions;
}
