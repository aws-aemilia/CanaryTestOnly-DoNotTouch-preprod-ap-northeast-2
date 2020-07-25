const queryHelper = require("../queryHelper");
const accountInfo = require("../accounts");
const patchSdk = require("../sdkpatcher");
const aws = require("aws-sdk");
const mapAppIdToAccountId = require("./mapAccountId");
const fs = require('fs');

const client_ddb = new aws.DynamoDB.DocumentClient();
const client_S3 = new aws.S3();

module.exports = {
    queryAllRegions: async (stage, time, timeRange, eventType) => {
        let regionList = accountInfo.getRegions()[stage];
        let accountsInfo = [];

        const [queryTime, queryType, queryContent] = queryHelper(
            timeRange,
            time,
            eventType
        );
        const query = queryTime + "/" + eventType;

        // Query all regions
        for (let region of regionList) {
            const stageRegion = stage + "-" + region;
            const ddb_params = {
                TableName: "hosting-insights-query-history-table",
                Key: {
                    query: query,
                    stageRegion: stageRegion,
                },
            };

            // Get S3 object key from DDB hosting insights history table
            let metaData = await client_ddb.get(ddb_params).promise();
            if (metaData.Item !== undefined && metaData.Item !== null) {
                // Data cached in hosting insights query history table
                continue;
            } else {
                // Query Athena
                const athena_params = {
                    QueryString: queryContent,
                    QueryExecutionContext: {
                        Database: "aemilia_cf_access_logs_db",
                    },
                    ResultConfiguration: {
                        OutputLocation:
                            "s3://" +
                            stage +
                            "-" +
                            region +
                            "-" +
                            "athena-results-hosting-insights" +
                            "/" +
                            queryType,
                    },
                };

                const client_athena = await patchSdk(stage, region, aws.Athena);
                client_athena.startQueryExecution(athena_params).promise();
            }
        }

        // Retrieve data from all regions
        for (let region of regionList) {
            const stageRegion = stage + "-" + region;
            const ddb_params = {
                TableName: "hosting-insights-query-history-table",
                Key: {
                    query: query,
                    stageRegion: stageRegion,
                },
            };
            while (true) {
                await new Promise((r) => setTimeout(r, 1000));

                // Get S3 object key from DDB hosting insights history table
                let metaData = await client_ddb.get(ddb_params).promise();
                if (metaData.Item !== undefined && metaData.Item !== null) {
                    // Get data object from hosting insights query history s3 bucket
                    const s3_params = {
                        Bucket: "aws-amplify-hosting-insights-query-history",
                        Key: metaData.Item.accountsInfo,
                    };
                    let data = await client_S3.getObject(s3_params).promise();
                    data = JSON.parse(data.Body);
                    accountsInfo.push({ id: data, region: region });
                    break;
                }
            }
        }

        let accounts = mapAppIdToAccountId(accountsInfo);
        return accounts;
    },

    queryOneRegion: async (stage, region, time, timeRange, eventType) => {
        const [queryTime, queryType, queryContent] = queryHelper(
            timeRange,
            time,
            eventType
        );
        const query = queryTime + "/" + eventType;
        const stageRegion = stage + "-" + region;

        const ddb_params = {
            TableName: "hosting-insights-query-history-table",
            Key: {
                query: query,
                stageRegion: stageRegion,
            },
        };

        // Get S3 object key from DDB hosting insights history table
        let metaData = await client_ddb.get(ddb_params).promise();
        let data;
        if (metaData.Item !== undefined && metaData.Item !== null) {
            // Data cached in hosting insights query history table
            // Get data object from hosting insights query history s3 bucket
            const s3_params = {
                Bucket: "aws-amplify-hosting-insights-query-history",
                Key: metaData.Item.accountsInfo,
            };
            data = await client_S3.getObject(s3_params).promise();
            data = JSON.parse(data.Body);
            let accountsInfo = [{ id: data, region: region }];
            let accounts = mapAppIdToAccountId(accountsInfo);
            return accounts;
        } else {
            // Query Athena
            const athena_params = {
                QueryString: queryContent,
                QueryExecutionContext: {
                    Database: "aemilia_cf_access_logs_db",
                },
                ResultConfiguration: {
                    OutputLocation:
                        "s3://" +
                        stage +
                        "-" +
                        region +
                        "-" +
                        "athena-results-hosting-insights" +
                        "/" +
                        queryType,
                },
            };

            const client_athena = await patchSdk(stage, region, aws.Athena);
            const queryExecutionId = await client_athena
                .startQueryExecution(athena_params)
                .promise();
            console.log("athena query execution id: " + queryExecutionId)
            while (true) {
                await new Promise((r) => setTimeout(r, 1000));

                // Wait query process complete
                const queryExecutionResult = await client_athena
                    .getQueryExecution(queryExecutionId)
                    .promise();
                if (
                    queryExecutionResult.QueryExecution.Status.State !=
                    "SUCCEEDED"
                )
                    continue;

                // Get S3 object key from DDB hosting insights history table
                metaData = await client_ddb.get(ddb_params).promise();
                if (metaData.Item !== undefined && metaData.Item !== null) {
                    // Get data object from hosting insights query history s3 bucket
                    const s3_params = {
                        Bucket: "aws-amplify-hosting-insights-query-history",
                        Key: metaData.Item.accountsInfo,
                    };

                    data = await client_S3.getObject(s3_params).promise();
                    data = JSON.parse(data.Body);
                    break;
                }
            }
            let accountsInfo = [{ id: data, region: region }];
            let accounts = mapAppIdToAccountId(accountsInfo);
            return accounts;
        }
    },
    
    fetchQueryOutput: async (stage, time, timeRange, eventType) => {
        let regionList = accountInfo.getRegions()[stage];
        const [queryTime, queryType, queryContent] = queryHelper(
            timeRange,
            time,
            eventType
        );
        const query = queryTime + "/" + eventType;
        for (let region of regionList) {
            const stageRegion = stage + "-" + region;
            const s3_params = {
                Bucket: "aws-amplify-hosting-insights-query-history",
                Key: "QueryOutput/" + stageRegion + '/' + query + '.csv',
            };

            const data = await client_S3.getObject(s3_params).promise();
            fs.writeFileSync("/tmp/result.csv", data.Body, { flag: "a+" });
        }
        return;
    },
};
