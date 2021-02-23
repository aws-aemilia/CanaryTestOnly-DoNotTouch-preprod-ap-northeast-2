var AWS = require("aws-sdk");
var moment = require("moment");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;
const run = async () => {
  const csvWriter = createCsvWriter({
    path: "DistrosToDelete.csv",
    header: [
      { id: "id", title: "ID" },
      { id: "datemodified", title: "DateModified" },
    ],
  });
  var cloudfront = new AWS.CloudFront();
  let nextMarker = "";
  let first = true;
  let found = [];
  let checked = 0;
  while (nextMarker || first) {
    first = false;
    var params = {
      Marker: nextMarker,
      MaxItems: "100",
    };
    const data = await cloudfront.listDistributions(params).promise();
    checked += 100;
    nextMarker = data.DistributionList.NextMarker;
    const items = data.DistributionList.Items.filter(
      (item) =>
        item.DefaultCacheBehavior.LambdaFunctionAssociations.Quantity === 0 &&
        item.Comment === "Cloudfront distribution for Aemilia" &&
        moment(item.LastModifiedTime).isBetween(
          moment("11/21/2020", "MM/DD/YYYY"),
          moment("12/01/2020", "MM/DD/YYYY")
        )
    );
    found = found.concat(
      items.map((item) => ({
        id: item.Id,
        datemodified: item.LastModifiedTime,
      }))
    );
    console.log(checked, found.length);
    //   await sleep(100)
  }
  csvWriter
    .writeRecords(found)
    .then(() => console.log("The CSV file was written successfully"));
  //   });
};
const ddbScan = async () => {
  const csvWriter = createCsvWriter({
    path: "DistrosInWarmingPool.csv",
    header: [{ id: "id", title: "ID" }],
  });
  var dynamodb = new AWS.DynamoDB({
    region: "ap-south-1",
  });
  var params = {
    TableName: "prod-ap-south-1-WarmFrontEndResources",
    Select: "ALL_ATTRIBUTES",
    ReturnConsumedCapacity: "TOTAL",
    Limit: 500,
  };
  const items = [];
  const csvItems = [];
  //   while (true) {
  let first = true;
  let total = 0;
  while (params.ExclusiveStartKey || first) {
    first = false;
    total += 500;
    const data = await dynamodb.scan(params).promise();
    console.log(total)
    // dynamodb.scan(params, function (err, data) {
    console.log(data.ConsumedCapacity, data.ScannedCount);
    data.Items.forEach(function (item) {
      // console.log(item, item.distributionId.S)
      items.push(item);
      csvItems.push({ id: item.distributionId.S })
    });
    if (typeof data.LastEvaluatedKey != "undefined") {
      params.ExclusiveStartKey = data.LastEvaluatedKey;
    } else {
      params.ExclusiveStartKey = undefined;
    }
    // });
  }
  csvWriter
    .writeRecords(csvItems)
    .then(() => console.log("The CSV file was written successfully"));
  //   }

};
ddbScan();