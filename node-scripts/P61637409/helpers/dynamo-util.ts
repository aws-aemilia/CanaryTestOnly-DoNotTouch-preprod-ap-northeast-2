import {
  DynamoDBDocumentClient,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";

export const exhaustiveScan = async (
  scanCommand: ScanCommand,
  ddbClient: DynamoDBDocumentClient,
  items: ScanCommandOutput["Items"] = []
) => {
  scanCommand.input.Limit = 500;
  const res = await ddbClient.send(scanCommand);

  if (res && res.Items && res.Items.length > 0) {
    items.push(...res.Items);
  }

  console.log(`${items.length} items found.`);

  if (typeof res.LastEvaluatedKey !== "undefined") {
    console.log(
      `More items available. Retrying in 1 second using the lastEvaluatedKey...`
    );

    scanCommand.input.ExclusiveStartKey = res.LastEvaluatedKey;

    // 1 second interval between each scan to prevent overloading the DDB table capacity
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await exhaustiveScan(scanCommand, ddbClient, items);
  }

  return items;
};
