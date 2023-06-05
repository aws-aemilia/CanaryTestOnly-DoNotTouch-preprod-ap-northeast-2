import { isServiceAccount } from "./accounts";
import { AmplifyServiceQueryResults } from "./types";

export const TITLE = 'Throttling Across Amplify Hosting';

export const toPlainText = (serviceQueryResults: AmplifyServiceQueryResults[]) => {
    // Add Header and Styling
    let plainText = '';
    plainText += addPlainTextHeader();

    // Add Header and Table for each service Results
    for (const serviceTable of serviceQueryResults) {
        plainText += `# ${serviceTable.service.serviceName}\n`;
        plainText += `Open the query in CloudWatch: ${serviceTable.service.linkToQuery}\n\n`;

        if (serviceTable.queryResponse!.length > 0) {
            plainText += `\tAWS Account Id\t\tRegion\t\tService\t\tNumber of Throttles\n`
            for (const line of serviceTable.queryResponse!) {
              plainText += `\t${line.customerAccountId}${isServiceAccount(line.customerAccountId) ? '*' : ''}\t\t${line.region}\t\t${line.service}\t\t${line.numberOfThrottles}\n`;
            }
        
            plainText += `\n`
            plainText += `\t(* Service/Test/Canary account)\n`
        } else {
            plainText += `No throttling occourced this past week in: ${serviceTable.service.serviceName}! 🎉\n`;
        }

        plainText += `_________________________________________________________\n\n`;
    }
    // Add Footer
    plainText += addPlainTextFooter();

    return plainText;
}

export const toHtml = (serviceQueryResults: AmplifyServiceQueryResults[]) => {
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
            <th>AWS Account Id (* Service/Test/Canary Account)</th>
            <th>Region</th>
            <th>Service</th>
            <th>Number of Throttles</th>
          </tr>`;
        
            for (const line of serviceTable.queryResponse!) {
                htmlStr += `  <tr>
                <td>${line.customerAccountId}${isServiceAccount(line.customerAccountId) ? '*' : ''}</td>
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
const addPlainTextHeader = (): string => {
    let plainTextHeader = '';
    plainTextHeader += `(data from the last week)\n`;
    plainTextHeader += `\n`;
    plainTextHeader += `\n`;
    return plainTextHeader;
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
    htmlStr += '<p><b>View this data tracked over time to see trends: <a href="https://tiny.amazon.com/epy55tps/IsenLink">dashboard</a></b></p>';
    htmlStr += '<p>(See more on our <a href="https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/ReportingDashboard/">Reporting Tool Dashboard</a>)</p>';
    htmlStr += '</body>';
    htmlStr += '</html>';
    return htmlStr;
}

const addPlainTextFooter = (): string => {
    let plainTextFooter = '';
    plainTextFooter += '\n';
    plainTextFooter += 'View this data tracked over time to see trends: https://tiny.amazon.com/epy55tps/IsenLink\n';
    plainTextFooter += '(See more on our Reporting Tool Dashboard: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/ReportingDashboard/\n';
    plainTextFooter += '\n';
    return plainTextFooter;
}