/*
 * Lambda@Edge Customer Impact Helper
 */

const aws = require("aws-sdk");
const credsFile = require("./creds.json");
const fs = require("fs-extra");

const region = "us-east-1";
const tableName = "prod-us-east-1-App";

const credentials = new aws.Credentials(credsFile.credentials);
aws.config.update({
  region: region,
  credentials
});

const dynamo = new aws.DynamoDB();

async function main() {

  // Read distribution messages
  const distributionMessages = fs.readJSONSync("distroMessages.json");
  const appIds = [];

  // Load AppIds
  distributionMessages.forEach(function(message) {
    const messageBody = JSON.parse(message.Body);
    appIds.push(messageBody.patch.DefaultCacheBehavior.TargetOriginId);
  });

  let affectedAppIds = [];
  const dynamoQueryPromises = appIds.map(async appId => {
    const params = {
      ExpressionAttributeValues: {
        ":s": {
          S: appId
        }
      },
      KeyConditionExpression: "appId = :s",
      ProjectionExpression: "appId",
      TableName: tableName
    };

    let result = await dynamo.query(params).promise();

    if (result.Count == 1) {
      affectedAppIds.push(appId);
    }
  });

  await Promise.all(dynamoQueryPromises);

  // Get unique appIds
  const uniqueAppIdsSet = new Set(affectedAppIds);
  const uniqueAppIds = [...uniqueAppIdsSet];

  fs.writeFileSync("impactedApps.json", uniqueAppIds, "utf8");
}

main();
