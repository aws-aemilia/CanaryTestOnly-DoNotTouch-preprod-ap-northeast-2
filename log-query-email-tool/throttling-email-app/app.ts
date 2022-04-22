
import { CloudWatchLogs, SES } from 'aws-sdk';
import { getQueryResult, startQuery } from './cloudwatchHelper';
import { AmplifyServices } from './amplifyServiceQueries';

import { sendSNSEmail } from './sesHelper';
import { AmplifyServiceQueryResults } from './types';

// clients
const cloudwatchLogsClient = new CloudWatchLogs({ region: process.env.AWS_REGION });
const ses = new SES({ region: process.env.AWS_REGION });

// constants
const TEAM_MEMBERS = ['aws-mobile-amplify@amazon.com'];
const TITLE = 'Throttling Across Amplify Hosting';
const ONE_WEEK_IN_MS = 24*7*60*60*1000;

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

    // format to html
    console.log(`format to html`);
    const htmlQueryResponse = toHtml(serviceQueryResults);

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

const toHtml = (serviceQueryResults: AmplifyServiceQueryResults[]) => {
    // Add Header and Styling
    let htmlStr = '<html>';
    htmlStr += addHeader();

    // Add Header and Table for each service Results
    for (const serviceTable of serviceQueryResults) {
        htmlStr += `<h2>${serviceTable.service.serviceName}</h2>`;
        htmlStr += `<p>Click <a href="${serviceTable.service.linkToQuery}">here</a> to open the query in CloudWatch.</p>`;

        if (serviceTable.queryResponse!.length > 0) {
            htmlStr += '<table>';
            htmlStr += `  <tr>
            <th>Customer AWS Account Id</th>
            <th>Region</th>
            <th>Service</th>
            <th>Number of Throttles</th>
          </tr>`;
        
            for (const line of serviceTable.queryResponse!) {
                htmlStr += `  <tr>
                <td>${line.customerAccountId}</td>
                <td>${line.region}</td>
                <td>${line.service}</td>
                <td>${line.numberOfThrottles}</td>
              </tr>`;
            }
            htmlStr += '</table>';
        } else {
            htmlStr += `<p>No throttling occourced this past week in: ${serviceTable.service.serviceName}! 🎉</p>`;
        }
        htmlStr += `<br/>`;
    }

    // Add Footer
    htmlStr += addFooter();

    return htmlStr;
}
const addHeader = (): string => {
    let htmlStr = '';
    htmlStr += `<head>
    <style>
    table {
      font-family: arial, sans-serif;
      border-collapse: collapse;
      width: 100%;
    }
    
    td, th {
      border: 1px solid #dddddd;
      text-align: left;
      padding: 8px;
    }
    
    tr:nth-child(even) {
      background-color: #dddddd;
    }
    </style>
    </head>`
    htmlStr += '<body>';
    htmlStr += `<h1>${TITLE}</h1>`;
    htmlStr += `<h3>(data from the last week)</h3>`;
    return htmlStr;
}
const addFooter = (): string => {
    let htmlStr = '';
    htmlStr += '<hr/>';
    htmlStr += '<p>See more on our <a href="https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/ReportingDashboard/">Reporting Tool Dashboard</a></p>';
    htmlStr += '</body>';
    htmlStr += '</html>';
    return htmlStr;
}