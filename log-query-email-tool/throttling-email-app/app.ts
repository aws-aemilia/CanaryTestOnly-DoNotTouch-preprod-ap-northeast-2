
import { CloudWatchLogs, SES, CloudWatch, SecretsManager } from 'aws-sdk';
import { getQueryResult, publishMetrics, startQuery } from './cloudwatchHelper';
import { AmplifyServices } from './amplifyServiceQueries';
import { sendSNSEmail } from './sesHelper';
import { AmplifyServiceQueryResults } from './types';
import { sendWebhook } from './webhookHelper';
import { GetSecretValueResponse } from 'aws-sdk/clients/secretsmanager';
import { getWebhookSecret } from './secretsManagerHelper';
import { TITLE, toHtml, toPlainText } from './textFormattingHelper';

// clients
const cloudwatchLogsClient = new CloudWatchLogs({ region: process.env.AWS_REGION });
const cloudwatchClient = new CloudWatch({ region: process.env.AWS_REGION });
const ses = new SES({ region: process.env.AWS_REGION });
const secretsManager = new SecretsManager({ region: process.env.AWS_REGION });

// constants
const TEAM_MEMBERS = ['aws-mobile-amplify@amazon.com'];
const ONE_WEEK_IN_MS = 24*7*1*60*60*1000;

export const lambdaHandler = async (): Promise<void> => {
    // start queries
    const serviceQueryResults: AmplifyServiceQueryResults[] = [];
    try {
        console.log('start queries');
        const NOW = new Date().getTime();
        const oneWeekAgo = new Date(NOW - ONE_WEEK_IN_MS).getTime();
        console.log(`start: ${oneWeekAgo} end: ${NOW}`)
        for (const service of AmplifyServices) {
            const queryId = await startQuery(oneWeekAgo, NOW, service.throttlingQuery, service.logGroup, cloudwatchLogsClient);
            serviceQueryResults.push({ service, queryId });
        }
    } catch (e) {
        console.error('error starting queries')
        console.error(e);
        return;
    }

    // wait to finish and gather results
    try {
        console.log('wait for queries to finish and gather results...')
        for (const serviceQueryResult of serviceQueryResults) {
            if (serviceQueryResult.queryId) {
                serviceQueryResult.queryResponse = await getQueryResult(serviceQueryResult.queryId, cloudwatchLogsClient);
            }
        }
    } catch (e) {
        console.error('error getting query results')
        console.error(e);
        return;
    }

    // publish cloudwatch metrics
    try {
        console.log('publish cloudwatch metrics...')
        for (const serviceQueryResult of serviceQueryResults) {
            await publishMetrics('Throttles',cloudwatchClient, serviceQueryResult);
        }
    } catch (e) {
        console.error('error getting query results')
        console.error(e);
        return;
    }

    // format to html
    console.log(`format to html`);
    const htmlQueryResponse = toHtml(serviceQueryResults);

    // format to plain text for slack
    console.log(`format to plain text for slack`);
    const plainTextResponse = toPlainText(serviceQueryResults);

    // send webhook
    if (process.env.SECRET_NAME) {
        try {
            console.log('get webhook url and sending webhook...');
            const webhookURLResponse: GetSecretValueResponse = await getWebhookSecret(process.env.SECRET_NAME!, secretsManager);
            if (webhookURLResponse && webhookURLResponse.SecretString) {
                const secret = JSON.parse(webhookURLResponse.SecretString!)
                const slackWebookUrl = secret[process.env.SECRET_NAME];
                await sendWebhook(plainTextResponse, slackWebookUrl);
                console.log(`webhook sent with content: ${plainTextResponse}`);
            }
        } catch (e) {
            console.error('error sending webhook');
            console.error(e);
            return;
        }
    }


    // send email
    try {
        console.log('sending email...');
        await sendSNSEmail(TEAM_MEMBERS, htmlQueryResponse, TITLE, ses);
        console.log(`email sent to: ${TEAM_MEMBERS}`);
    } catch (e) {
        console.error('error sending email');
        console.error(e);
        return;
    }
};


