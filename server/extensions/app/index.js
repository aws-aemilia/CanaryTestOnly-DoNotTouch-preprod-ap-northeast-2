const aws = require('aws-sdk');

const appTable = 'prod-us-west-2-App';
const getAppDO = (appId, region) => {
    const ddb = aws.DynamoDB;
    ddb.query({
        ExpressionAttributeValues: {
            ':v1': {
                S: appId
            }
        },
        KeyConditionExpression: "appId = :v1",
        ProjectionExpression: 'appId,buildSpec,',
        TableName: 'prod-' + region + '-App'
    });
}
