# lambda-query-runner

Runs queries in ServiceLogs log group (which aggregates data from all our services across all our regions) to gather useful data and send it in a weekly email to the `aws-mobile-amplify` team.

## Steps to add queries to the tool.
1. add the service and query to the `amplifyServiceQueries.ts` file.
2. cd to the root directory of this project `lambda-query-runner`
3. export temporary credentials for the Amplify Oncall Tools Account: https://isengard.amazon.com/manage-accounts/643036967432/
4. Run `sam build && sam deploy`
5. Now the next email sent on the next Monday will include your changes!