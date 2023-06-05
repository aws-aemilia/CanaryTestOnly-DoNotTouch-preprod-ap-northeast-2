import { AthenaClient, GetQueryExecutionCommand, paginateGetQueryResults, Row, StartQueryExecutionCommand } from "@aws-sdk/client-athena";

export const startAthenaQuery = async (client: AthenaClient, statement: string, outputBucket: string): Promise<string> => {
    const command = new StartQueryExecutionCommand({
        QueryString: statement,
        ResultConfiguration: {
            OutputLocation: `s3://${outputBucket}`
        }
    });
    const response = await client.send(command);
    if (!response.QueryExecutionId) {
        throw new Error('could not start athena query');
    }

    return response.QueryExecutionId;
}


export const waitForAthenaQuery = async (client: AthenaClient, id: string): Promise<void> => {
    let status: string | undefined = 'QUEUED'
    while (status && (status === 'RUNNING' || status === 'QUEUED')) {
        try {
            const queryResponse = await client.send(new GetQueryExecutionCommand({
                QueryExecutionId: id
            }));
            if (queryResponse.QueryExecution && queryResponse.QueryExecution.Status) {
                status = queryResponse.QueryExecution.Status.State
                console.log('...athena query status: ' + status)
            }
        } catch (e) {
            console.error(JSON.stringify(e));
        }
        await new Promise(r => setTimeout(r, 3000));
    }
}

export const getAthenaQueryResults = async (client: AthenaClient, id: string): Promise<Row[]> => {
    const allRecords: Row[] = []
    try {
        for await (const page of paginateGetQueryResults({ client }, {QueryExecutionId: id})) {
            if (page.ResultSet && page.ResultSet.Rows) {
                for (const rec of page.ResultSet.Rows) {
                    allRecords.push(rec);
                }
            }
        }
    } catch(e) {
        console.error(e);
    }
    return allRecords;
}