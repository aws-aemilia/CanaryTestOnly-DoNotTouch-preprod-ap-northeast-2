import {
  DescribeStatementCommand,
  ExecuteStatementCommand,
  Field,
  paginateGetStatementResult,
  RedshiftDataClient,
} from "@aws-sdk/client-redshift-data";

export const startRedshiftQuery = async (
  client: RedshiftDataClient,
  statement: string
): Promise<string> => {
  const command = new ExecuteStatementCommand({
    ClusterIdentifier: "amplify-business-metrics-prod",
    Database: "dev",
    DbUser: "awsuser",
    Sql: statement,
  });
  const response = await client.send(command);
  if (!response.Id) {
    throw new Error("could not start query");
  }
  return response.Id;
};

export const waitForRedshiftQuery = async (
  client: RedshiftDataClient,
  id: string
): Promise<void> => {
  let status: string | undefined = "STARTED";
  while (status && status !== "FINISHED" && status !== "FAILED") {
    try {
      const queryResponse = await client.send(
        new DescribeStatementCommand({
          Id: id,
        })
      );
      status = queryResponse.Status;
      console.log("...redshift query status: " + status);
    } catch (e) {
      console.error(JSON.stringify(e));
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
};

export const getRedshiftQueryResults = async (
  client: RedshiftDataClient,
  id: string
): Promise<Field[][]> => {
  const allRecords: Field[][] = [];
  try {
    for await (const page of paginateGetStatementResult(
      { client },
      { Id: id }
    )) {
      if (page.Records) {
        for (const rec of page.Records) {
          allRecords.push(rec);
        }
      }
    }
  } catch (e) {
    console.error(e);
  }
  return allRecords;
};
