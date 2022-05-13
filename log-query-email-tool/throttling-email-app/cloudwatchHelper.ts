import CloudWatchLogs from "aws-sdk/clients/cloudwatchlogs";
import CloudWatch from "aws-sdk/clients/cloudwatch";
import { AmplifyServiceQueryResults, TableRow } from "./types";

const METRIC_NAMESPACE = 'LambdaQueryRunner';

export const publishMetrics = async (metricType: string, cloudwatchClient: CloudWatch, serviceQueryResult: AmplifyServiceQueryResults) => {
    let throttleMap: any = {};
    for (const row of serviceQueryResult.queryResponse!) {
        if (Object.keys(throttleMap).includes(row.service)) {
            if (Object.keys(throttleMap[row.service]).includes(row.region)) {
                throttleMap[row.service][row.region] += Number(row.numberOfThrottles);
            } else {
                throttleMap[row.service][row.region] = Number(row.numberOfThrottles)
            }
        } else {
            throttleMap[row.service] = {};
            throttleMap[row.service][row.region] = Number(row.numberOfThrottles)
        }
    }

    for (const serviceThrottle of Object.keys(throttleMap)) {
        for (const regionThrottled of Object.keys(throttleMap[serviceThrottle])) {
            const params = {
                MetricData: [
                    {
                        MetricName: serviceThrottle,
                        Dimensions: [
                            {
                                Name: regionThrottled,
                                Value: `${serviceQueryResult.service.serviceName.split(' ').join('-')}-${metricType}`
                            },
                        ],
                        Unit: 'None',
                        Value: throttleMap[serviceThrottle][regionThrottled]
                    },
                ],
                Namespace: METRIC_NAMESPACE
            };
            await cloudwatchClient.putMetricData(params).promise();
        }
    }
}

export const startQuery = async (start: number, end: number, query: string, logGroup: string, cloudwatchLogsClient: CloudWatchLogs): Promise<string> => {
    const startQueryResponse = await cloudwatchLogsClient.startQuery({
        startTime: start,
        endTime: end,
        queryString: query,
        logGroupName: logGroup,
        limit: 20
    }).promise();
    if (startQueryResponse.queryId) {
        return startQueryResponse.queryId!
    } else {
        throw new Error("did not get queryId")
    }
}

export const getQueryResult = async (queryId: string, cloudwatchLogsClient: CloudWatchLogs): Promise<TableRow[]> => {
    let queryResponse: TableRow[] = [];
    let status = null;
    do {
        try {
            const getQueryResultsResponse = await cloudwatchLogsClient.getQueryResults({ queryId }).promise();
            status = getQueryResultsResponse.status || "Failed"
            if (status === "Complete") {
                for (const row of getQueryResultsResponse.results!) {
                    let customerAccountId = "";
                    let region = "";
                    let service = "";
                    let numberOfThrottles = "";
                    for (const fields of row) {
                        if (fields.field! === "customerAccountId") {
                            customerAccountId = fields.value!;
                        } else if (fields.field! === "region") {
                            region = fields.value!;
                        } else if (fields.field! === "theService") {
                            service = fields.value!;
                        } else if (fields.field! === "throttles") {
                            numberOfThrottles = fields.value!;
                        }
                    }
                    service = service === "" ? "N/A" : service;
                    queryResponse.push({
                        customerAccountId,
                        region,
                        service,
                        numberOfThrottles
                    });
                }
            } else {
                await delay(5 * 1000)
            }
        } catch (e) {
            console.error('error getting query results')
            console.error(e);
            status = "Failed"
        }
    } while (status === "Scheduled" || status === "Running")
    return queryResponse;
}

const delay = (ms: number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}