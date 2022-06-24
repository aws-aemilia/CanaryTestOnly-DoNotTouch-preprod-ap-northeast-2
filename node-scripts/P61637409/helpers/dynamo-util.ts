import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { App } from "../types";

export const exhaustiveScan = async (
  itemName: string,
  scanCommand: ScanCommand,
  ddbClient: DynamoDBDocumentClient,
  items: ScanCommandOutput["Items"] = []
) => {
  scanCommand.input.Limit = 500;
  const res = await ddbClient.send(scanCommand);

  if (res && res.Items && res.Items.length > 0) {
    items.push(...res.Items);
  }

  console.log(
    JSON.stringify({
      message: `${items.length} ${itemName} items found so far.`,
    })
  );

  if (typeof res.LastEvaluatedKey !== "undefined") {
    console.log(
      JSON.stringify({
        message: `More ${itemName} items available. Re-scanning in 1 second.`,
      })
    );

    scanCommand.input.ExclusiveStartKey = res.LastEvaluatedKey;

    // 1 second interval between each scan to prevent overloading the DDB table capacity
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await exhaustiveScan(itemName, scanCommand, ddbClient, items);
  }

  return items;
};

export const getApp = async (
  stage: string,
  region: string,
  appId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const TableName = `${stage}-${region}-App`;
  const get = new GetCommand({
    TableName,
    Key: {
      appId,
    },
    ProjectionExpression: "appId,accountId,platform",
  });

  const res = await ddbClient.send(get);

  if (!res || !res.Item) {
    return;
  }

  return res.Item as App;
};

export const getDomainApp = async (
  stage: string,
  region: string,
  domainId: string,
  ddbClient: DynamoDBDocumentClient
) => {
  const TableName = `${stage}-${region}-Domain`;

  const queryDomain = new QueryCommand({
    TableName,
    IndexName: "domainId-index",
    KeyConditionExpression: "domainId = :domainId",
    ExpressionAttributeValues: {
      ":domainId": domainId,
    },
    ProjectionExpression: "appId",
  });

  const resDomains = await ddbClient.send(queryDomain);

  if (resDomains && resDomains.Items && resDomains.Items.length > 0) {
    const domain = resDomains.Items[0];
    const domainAppId = domain.appId;

    return getApp(stage, region, domainAppId, ddbClient);
  }
};
