const AWS = require("aws-sdk");
const history_s3 = new AWS.S3({region: 'us-west-2'});

const patchSdk = require("../sdkpatcher");
const queryExtractor = require("../helper/queryExtractor");
const csvReader = require("../helper/csvReader");
const jsonConverter = require("../helper/jsonConverter");
const appIdUpdater = require("../helper/appIdUpdater");

exports.handler = async function (event, context) {
    // Load Env variable
    const query_history_s3_bucket = process.env.INSIGHTS_QUERY_HISTORY_S3;
    const stage = process.env.STAGE;
    const region = process.env.REGION

    // Locate Athena query result file in Athena Query Result S3 bucket
    const bucket = event.Records[0].s3.bucket.name;
    const objectKey = decodeURIComponent(
        event.Records[0].s3.object.key.replace(/\+/g, " ")
    );
    const keyArray = objectKey.split("/");
    const filename = keyArray[keyArray.length - 1];
    const queryType = keyArray[0]
    
    // Patch Athena client to get query content by Athena query executionId
    const athena = await patchSdk(stage, region, AWS.Athena);
    const queryExecutionId = filename.split(".")[0];
    let queryContent;
    try {
        const params = {
            QueryExecutionId: queryExecutionId,
        };
        queryContent = await athena.getQueryExecution(params).promise();
    } catch (error) {
        console.log(error);
        return;
    }

    // Extract query content 
    let [queryTime, eventType] = queryExtractor(queryContent, queryType);

    // Patch S3 client to get Athena query result file from Athena Query Result S3 bucket
    const result_s3 = await patchSdk(stage, region, AWS.S3);
    let originCSV;
    try {
        const params = {
            Bucket: bucket,
            Key: objectKey,
        };
        originCSV = result_s3.getObject(params).createReadStream();
    } catch (error) {
        console.log(error);
        return;
    }

    // Read .csv file and extract CloudFrontDistributionIds
    let domainIds = await csvReader(originCSV);

    // Patch DDB client in prod account
    const ddb = await patchSdk(stage, region, AWS.DynamoDB.DocumentClient);

    // Query Domain table to get AppId
    const DomainTable = stage + "-" + region + "-" + "Domain";
    let DomainDDBQueryQueue = [];
    for(let domainId of domainIds){
        const params = {
            TableName: DomainTable,
            IndexName: "domainId-index",
            KeyConditionExpression: "domainId = :id",
            ProjectionExpression: "appId, domainId",
            ExpressionAttributeValues: {
                ":id": domainId,
            },
        };
        DomainDDBQueryQueue.push(ddb.query(params).promise());
    }

    let appIds;
    try {
        let DomainDDBQueryResults = await Promise.all(DomainDDBQueryQueue);
        appIds = appIdUpdater(DomainDDBQueryResults, domainIds);
    } catch (error) {
        console.log(error);
        return;
    }
    
    // Query DDB App table to get accountId
    const AppTable = stage + "-" + region + "-" + "App";
    let AppDDBQueryQueue = [];
    for (let appId of appIds) {
        const params = {
            TableName: AppTable,
            Key:{
                "appId": appId
            },
            ProjectionExpression: "accountId, appId"
        };
        AppDDBQueryQueue.push(ddb.get(params).promise());
    }

    let scanResults = [];
    try {
        scanResults = await Promise.all(AppDDBQueryQueue);
    } catch (error) {
        console.log(error);
        return;
    }
    
    // Convert scan results to JSON format
    let tempJson = jsonConverter(scanResults);

    // Put scan results to query history S3 bucket
    try {
        const params = {
            Body: tempJson,
            Bucket: query_history_s3_bucket,
            Key: stage + "-" + region + "/" + queryTime + "/" + eventType,
            ServerSideEncryption: 'aws:kms'
        };
        await history_s3.putObject(params).promise();
    } catch (error) {
        console.log(error);
        return;
    }
    console.log("Successfully put query result to " + query_history_s3_bucket)
};
