const express = require('express');
const bodyParser = require("body-parser");
const path = require('path');
const aws = require('aws-sdk');
const accounts = require('./extensions/accounts');
const businessMetrics = require('./extensions/businessMetrics');
const {getEvent} = require('./event');
const patchSdk = require('./extensions/sdkpatcher');
const {getAccountId} = require('./extensions/accounts');
const Metering = require('./extensions/metering');

const allowedUsers = [
  'anatonie',
  'loganch',
  'dangred',
  'lisirui',
  'heutsr',
  'snimakon',
  'shufakan',
  'hzhenmin'
];

const app = express();
let username;

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));
app.use(bodyParser.json());

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
        res.json({message: username ? `Unauthorized: User ${username} is unauthorized` : `Unauthorized: Midway identifier not found`})
    } else {
        next();
    }
  } else {
    next();
  }
});

app.get('/username', async (req, res) => res.send(username));

app.get('/regions', (req, res) => res.json(accounts.getRegions()));

app.post('/metering/delete', Metering.deleteMessage);

app.get('/metering/get', Metering.getMessages);

app.get('/api/metrics/builds/failed', async (req, res) => {
    let query = '';
    if (req.param('accountId')){
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
    if (req.param('accountId')){
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

        let buildIds = await codebuild.listBuildsForProject({'projectName': req.body.project, 'nextToken': req.body.token ? req.body.token : undefined}).promise();
        let codebuildBuilds = await codebuild.batchGetBuilds({'ids': buildIds['ids']}).promise();
        let token = buildIds.nextToken;

        builds = builds.concat(codebuildBuilds.builds);

        res.end(JSON.stringify({'builds': builds, token}));
    } catch (err) {
        console.log('error calling codebuild');
        console.log(err);
        res.status(400);
        res.end(JSON.stringify({'error': err}));
    }
});

app.get('/api/logs', async (req, res) => {
    try {
        const cloudwatchlogs = await patchSdk('prod', req.query['region'], aws.CloudWatchLogs);
        cloudwatchlogs.getLogEvents({'logGroupName': req.query['logGroupName'], 'logStreamName': req.query['logStreamName']}, function(err, data) {
            if (err) res.end(JSON.stringify(err)); // an error occurred
            else     res.end(JSON.stringify(data));           // successful response
        });
    } catch (err) {
        res.end(JSON.stringify({'error': err}));
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
        await patchSdk('prod', region, aws.S3).headObject(params, function(err, data) {
            if (err) {
                console.log('error in s3');
                console.log(err);
                res.end(JSON.stringify({'error': err}))
            } else {
                console.log(data);
                res.end(JSON.stringify(data))
            }
        });
    } catch (err) {
        console.log('error');
        res.end(JSON.stringify({'error': err}))
    }
});

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.sendFile(path.join(__dirname+'/../client/build/index.html'));
});

// app.listen(config.port);
// console.log('App is listening on port ' + config.port);
module.exports = app;
