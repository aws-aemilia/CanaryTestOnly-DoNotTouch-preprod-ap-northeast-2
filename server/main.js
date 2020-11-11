const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const aws = require('aws-sdk');
const proxy = require('http-proxy-middleware');
const accounts = require('./extensions/accounts');
const fs = require('fs');
const businessMetrics = require('./extensions/businessMetrics');
const { getEvent } = require('./event');
const patchSdk = require('./extensions/sdkpatcher');
const { getAccountId } = require('./extensions/accounts');
const Metering = require('./extensions/metering');
const {
    queryAllRegions,
    queryOneRegion,
    fetchQueryOutput,
} = require("./extensions/insightsHelper");
const queryHelper = require("./extensions/queryHelper");

if(process.env.NODE_ENV == "development") {

    let credentials = new aws.SharedIniFileCredentials({ profile: "brandon-aws" });
    aws.config.credentials = credentials;
    aws.config.region = "us-west-2";

}



const allowedUsers = [
    'anatonie',
    'loganch',
    'lisirui',
    'snimakom',
    'nsswamin',
    'haoyujie',
    'litwjaco',
    'donkahn',
    'bradruof',
    'guerarda',
    'rjabhi',
    'rugary',
    'jffranzo',
    'weikding',
    'behroozi',
    'brnmye'
];

const app = express();
let username;

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));
app.use(bodyParser.json());

if(process.env.NODE_ENV !== "development") {
    app.use((req, res, next) => {
        res.append('Access-Control-Allow-Origin', ['*']);
        res.append('Access-Control-Allow-Headers', 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token');
        const options = 'OPTIONS';
        if (req.method !== options) {
            username = undefined;
            const event = getEvent();
            if (event.requestContext && event.requestContext.identity && event.requestContext.identity.cognitoAuthenticationProvider) {
                const cognitoAuthenticationProvider = event.requestContext.identity.cognitoAuthenticationProvider;
                const parts = cognitoAuthenticationProvider.split(':');
                username = parts[parts.length - 1];
            }
            if (!username || allowedUsers.indexOf(username) < 0) {
                res.status(403);
                res.json({ message: username ? `Unauthorized: User ${username} is unauthorized` : `Unauthorized: Midway identifier not found` })
            } else {
                next();
            }
        } else {
            // next();
            res.send(200);
        }
    });

}


const proxyOptions = {
    target: 'https://oncall-api.corp.amazon.com', // target host
    // changeOrigin: true, // needed for virtual hosted sites
    // ws: true, // proxy websockets
    pathRewrite: {
        '^/proxy/oncall': '/' // remove base path
    }
};
app.use('/proxy/oncall', proxy(proxyOptions));

app.get('/username', async (req, res) => res.send(username));

app.get('/regions', (req, res) => res.json(accounts.getRegions()));

app.post('/metering/delete', Metering.deleteMessage);

app.get('/metering/get', Metering.getMessages);

app.get('/api/metrics/builds/failed', async (req, res) => {
    console.log('app lookup request params: ', req.params)
    let query = '';
    if (req.param('accountId')) {
        query = `select * from main where accountid = '${req.param('accountId')}' order by timestamp desc`;
    } else if (req.param('appId')) {
        query = `select * from main where appid = '${req.param('appId')}' order by timestamp desc`;
    } else if (req.param('days')) {
        query = `select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' and timestamp > current_date - interval '${req.param('days')} day';`;
    } else if (req.param('daysFrom') && req.param('daysTo')) {
        query = `select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' and timestamp > current_date - interval '${req.param('daysFrom')} day' and timestamp < current_date - interval '${req.param('daysTo')} day' order by timestamp desc;`;
    } else {
        query = 'select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' order by timestamp desc limit 500';
    }
    if (query) {
        try {
            const data = await businessMetrics(query);
            res.json(data);
        } catch (error) {
            res.status(500);
            res.json(error);
        }
    } else {
        res.status(400);
        res.end('Invalid request');
    }
});

app.get('/api/metrics/builds/succeed', async (req, res) => {
    let query = '';
    if (req.param('accountId')) {
        query = `select * from main where accountid = '${req.param('accountId')}' and jobid is not null order by timestamp desc`;
    } else if (req.param('appId')) {
        query = `select * from main where appid = '${req.param('appId')}' and jobid is not null order by timestamp desc`;
    } else if (req.param('days')) {
        query = `select * from main where timestamp > current_date - interval '${req.param('days')} day and jobid is not null';`;
    } else if (req.param('daysFrom') && req.param('daysTo')) {
        query = `select * from main where timestamp > current_date - interval '${req.param('daysFrom')} day' and timestamp < current_date - interval '${req.param('daysTo')} day' and jobid is not null order by timestamp desc;`;
    } else {
        query = 'select * from main where jobid is not null order by timestamp desc limit 500';
    }
    if (query) {
        try {
            const data = await businessMetrics(query);
            res.json(data);
        } catch (error) {
            res.status(500);
            res.json(error);
        }
    } else {
        res.status(400);
        res.end('Invalid request');
    }
});

app.post('/api/builds', async (req, res) => {
    try {
        const codebuild = await patchSdk('prod', req.body.region, aws.CodeBuild);
        let builds = [];

        let buildIds = await codebuild.listBuildsForProject({
            'projectName': req.body.project,
            'nextToken': req.body.token ? req.body.token : undefined
        }).promise();
        let codebuildBuilds = await codebuild.batchGetBuilds({ 'ids': buildIds['ids'] }).promise();
        let token = buildIds.nextToken;

        builds = builds.concat(codebuildBuilds.builds);

        res.end(JSON.stringify({ 'builds': builds, token }));
    } catch (err) {
        console.log('error calling codebuild');
        console.log(err);
        res.status(400);
        res.end(JSON.stringify({ 'error': err }));
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const cloudwatchlogs = await patchSdk('prod', req.query['region'], aws.CloudWatchLogs);
        cloudwatchlogs.getLogEvents({
            'logGroupName': req.query['logGroupName'],
            'logStreamName': req.query['logStreamName']
        }, function (err, data) {
            if (err) res.end(JSON.stringify(err)); // an error occurred
            else res.end(JSON.stringify(data)); // successful response
        });
    } catch (err) {
        res.end(JSON.stringify({ 'error': err }));
    }

});

app.get('/api/logsbyprefix', async (req, res) => {
    try {
        const cloudwatchlogs = await patchSdk('prod', req.query['region'], aws.CloudWatchLogs);

        let nextToken = undefined;
        let builds = [];
        do {
            let result = await cloudwatchlogs.describeLogStreams({
                'logGroupName': req.query['logGroupName'],
                'logStreamNamePrefix': req.query['logStreamNamePrefix'],
                'limit': 50,
                nextToken
            }).promise();

            builds = builds.concat(result.logStreams);
        } while (!!nextToken);

        res.end(JSON.stringify(builds));
    } catch (err) {
        res.end(JSON.stringify({ 'error': err }));
    }
});

app.get('/api/cachemeta', async (req, res) => {
    try {
        const appId = req.query['appId'];
        const branchName = req.query['branchName'];
        const region = req.query['region'];
        accounts.setAWSConfig(region);
        const params = {
            Bucket: 'aws-amplify-prod-' + region + '-artifacts',
            Key: appId + '/' + branchName + '/BUILD/cache.tar'
        };
        await patchSdk('prod', region, aws.S3).headObject(params, function (err, data) {
            if (err) {
                console.log('error in s3');
                console.log(err);
                res.end(JSON.stringify({ 'error': err }))
            } else {
                console.log(data);
                res.end(JSON.stringify(data))
            }
        });
    } catch (err) {
        console.log('error');
        res.end(JSON.stringify({ 'error': err }))
    }
});

app.get('/cwlogs/groups', async (req, res) => {
    const stage = req.query['stage'];
    const region = req.query['region'];
    const sdkRegion = req.query['sdkRegion'];
    try {
        const client = await patchSdk(stage, region, aws.CloudWatchLogs, sdkRegion);
        let nextToken = undefined;
        let logGroups = [];
        do {
            const result = await client.describeLogGroups({ limit: 50, nextToken }).promise();
            nextToken = result.nextToken;
            logGroups = [
                ...logGroups,
                ...result.logGroups
            ]
        } while (!!nextToken);
        res.json(logGroups);
    } catch (e) {
        console.log('error getting cloudwatch log groups');
        console.log(e);
        res.status(400);
        res.json(e);
    }
});

app.post('/cwlogs/events/filter', async (req, res) => {
    const { stage, region, sdkRegion, ...params } = req.body;
    try {
        const client = await patchSdk(stage, region, aws.CloudWatchLogs, sdkRegion);
        const result = await client.filterLogEvents(params).promise();
        res.json(result);
    } catch (e) {
        console.log('error filtering cloudwatch log events');
        console.log(e);
        res.status(400);
        res.json(e);
    }
});

app.post('/cwlogs/events/get', async (req, res) => {
    const { stage, region, sdkRegion, ...params } = req.body;
    try {
        const client = await patchSdk(stage, region, aws.CloudWatchLogs, sdkRegion);
        const result = await client.getLogEvents(params).promise();
        res.json(result);
    } catch (e) {
        console.log('error getting cloudwatch log events');
        console.log(e);
        res.status(400);
        res.json(e);
    }
});

app.post("/insights/accountInfo", async (req, res) => {
    const { stage, region, time, timeRange, eventType } = req.body;
    let accounts = [];
    console.log(req.body)
    if (region === "global") {
        try {
            accounts = await queryAllRegions(stage, time, timeRange, eventType);
            res.send(accounts);
        } catch (error) {
            res.status(500);
            console.log(error.message + error.stack)
            res.json(error);
        }
    } else {
        try {
            accounts = await queryOneRegion(
                stage,
                region,
                time,
                timeRange,
                eventType
            );
            res.send(accounts);
        } catch (error) {
            res.status(500);
            console.log(error.message + error.stack)
            res.json(error);
        }
    }
});

app.post("/insights/queryOutput", async (req, res) => {
    const { stage, region, time, timeRange, eventType } = req.body;
    try {
        await fetchQueryOutput(stage, region, time, timeRange, eventType);
        res.download('/tmp/result.csv', () => {
            fs.unlinkSync("/tmp/result.csv");
        });
    } catch (error) {
        res.status(500);
        console.log(error.message, error.stack)
        res.json(error);
    }
});

app.post("/insights/clear", async (req, res) => {
    const { stage, region, time, timeRange, eventType } = req.body;
    let regionList = (region === "global") ? accounts.getRegions()[stage] : [region];
    const [queryTime, queryType, queryContent] = queryHelper(
        timeRange,
        time,
        eventType
    );
    const query = queryTime + "/" + eventType;
    const ddb = new aws.DynamoDB.DocumentClient();
    let ddbPromisesArray = [];
    try {
        for (let current_region of regionList) {
            const params = {
                TableName: "hosting-insights-query-history-table",
                Key: {
                    query: query,
                    stageRegion: stage + "-" + current_region,
                },
            };
            ddbPromisesArray.push(ddb.delete(params).promise());
        }
        await Promise.all(ddbPromisesArray);
        res.status(200);
        res.end();
    } catch (error) {
        res.status(500);
        console.log(error.message, error.stack)
        res.json(error);
    }
});


app.get("/customerinfo", async (req, res) => {

    const { stage, region, query } = req.query;
    // const ddb = new aws.DynamoDB.DocumentClient();
    // const documentClient = new aws.DynamoDB.DocumentClient();
    const params = {
        "TableName": `${stage}-${region}-App`,
        "KeyConditionExpression": "#DYNOBASE_appId = :pkey",
        "ExpressionAttributeValues": {
            ":pkey": query
        },
        "ExpressionAttributeNames": {
            "#DYNOBASE_appId": "appId"
        },
        "ScanIndexForward": true
    };

    try {
        // client should pass credentials
        const client = await patchSdk(stage, region, aws.DynamoDB.DocumentClient);
        const result = await client.get(params).promise();
        // const response = await client.get({Key: "${appId}", TableName: `${stage}-${region}-App`});
        
        console.log("res.json worked");
        res.status(200);
        // res.json(result.Item);
        res.json(response.Item);
        console.log(res.json);
        console.log(res.json(result.Item));
    } catch (e) {
        console.log("res.json did not work");
        console.error(e);
        res.status(500);
        res.send("Internal Service Error");
    }
});


// ddb call for appId table
// app.get("/customerinfo", async (req, res) => {

//     const { stage, region, query } = req.query;
//     // const ddb = new aws.DynamoDB.DocumentClient();
//     const documentClient = new aws.DynamoDB.DocumentClient();
//     const params = {
//         "TableName": `${stage}-${region}-App`,
//         "KeyConditionExpression": "#DYNOBASE_appId = :pkey",
//         "ExpressionAttributeValues": {
//             ":pkey": query
//         },
//         "ExpressionAttributeNames": {
//             "#DYNOBASE_appId": "appId"
//         },
//         "ScanIndexForward": true
//     };

//     try {
//         const client = await patchSdk(stage, region, aws.DynamoDB);
//         const result = await documentClient.query(params).promise();
//         res.json(result.Items[0]);
//         console.log("res.json worked")
//     } catch (e) {
//         res.send(e);
//         console.log("res.json did not work")
//     }


// });

// // ddb call for branch table
// app.get("/customerinfo", async (req, res) => {
//     const { stage, region, query } = req.query;
//     // const ddb = new aws.DynamoDB.DocumentClient();
//     const documentClient2 = new aws.DynamoDB.DocumentClient();
//     const params = {
//         "TableName": `${stage}-${region}-Branch`,
//         "KeyConditionExpression": "#DYNOBASE_appId = :pkey",
//         "ExpressionAttributeValues": {
//             ":pkey": query
//         },
//         "ExpressionAttributeNames": {
//             "#DYNOBASE_appId": "appId"
//         },
//         "ScanIndexForward": true
//     };

//     // error fetching ddb data on deployed app happpening here
//     try {
//         const result = await documentClient2.query(params).promise();
//         res.json(result.Items[0]);
//         console.log("res.json worked")
//     } catch (e) {
//         res.send(e);
//         // running search on deployed version gives this log in cloudwatch logs
//         console.log("res.json did not work")
//     }


// });

// Handles any requests that don't match the ones above
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname + '/../client/build/index.html'));
});

// app.listen(config.port);
// console.log('App is listening on port ' + config.port);
module.exports = app;
