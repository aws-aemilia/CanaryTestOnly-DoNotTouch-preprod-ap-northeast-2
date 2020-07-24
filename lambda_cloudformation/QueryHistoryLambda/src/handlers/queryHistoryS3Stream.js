const AWS = require('aws-sdk');
const ddb = new AWS.DynamoDB.DocumentClient();

exports.handler = async function(event, context) {
    const insights_DDB = process.env.AMPLIFY_INSIGHTS_TOOL_DDB;
    const record = event.Records[0];
	const object = record.s3.object;
    const key = decodeURIComponent(object.key.replace(/\+/g, " "));
    const prefix = key.split("/")[0];
    const stageRegion = key.split("/")[1];
    const query = key.slice(prefix.length + stageRegion.length + 2)

    // Put query result object key(S3 location reference) to DDB hosting insights tool history table 
    try {
        const params = {
            TableName: insights_DDB,
            Item: {
                query: query,
                stageRegion: stageRegion,
                accountsInfo: key,
            }
        };
        await ddb.put(params).promise();
    }
    catch (error) {
        console.log(error);
        return;
    }
}