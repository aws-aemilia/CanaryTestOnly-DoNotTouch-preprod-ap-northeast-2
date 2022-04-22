import CloudWatchLogs from "aws-sdk/clients/cloudwatchlogs";
import { TableRow } from "./types";

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

            console.log("status " + status)
            console.log("results " + JSON.stringify(getQueryResultsResponse.results!))
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