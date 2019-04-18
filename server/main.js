const express = require('express');
const path = require('path');
const config = require('./config');
const redShiftClient = config.db.get();
const aws = require('aws-sdk');
const accounts = require('./extensions/accounts');

const app = express();

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, '../client/build')));

app.get('/api/metrics/builds/failed', (req, res) => {
    if (req.param('accountId')){
        redShiftClient.query(`select * from main where accountid = '${req.param('accountId')}' order by timestamp desc`, {}, function(err, data){
            if(err) throw err;
            else{
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('appId')) {
        redShiftClient.query(`select * from main where appid = '${req.param('appId')}' order by timestamp desc`, {}, function (err, data) {
            if (err) throw err;
            else {
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('days')) {
        redShiftClient.query(`select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' and timestamp > current_date - interval '${req.param('days')} day';`, {}, function (err, data) {
            if (err) throw err;
            else {
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('daysFrom') && req.param('daysTo')) {
            redShiftClient.query(`select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' and timestamp > current_date - interval '${req.param('daysFrom')} day' and timestamp < current_date - interval '${req.param('daysTo')} day' order by timestamp desc;`, {}, function(err, data){
                if(err) throw err;
                else{
                    res.end(JSON.stringify(data));
                }
            });
    } else {
        redShiftClient.query('select * from main where jobstatus = \'FAILED\' and failedstep = \'BUILD\' order by timestamp desc limit 500', {}, function(err, data){
            if(err) throw err;
            else{
                res.end(JSON.stringify(data));
            }
        });
    }

});

app.get('/api/metrics/builds/succeed', (req, res) => {
    if (req.param('accountId')){
        redShiftClient.query(`select * from main where accountid = '${req.param('accountId')}' order by timestamp desc`, {}, function(err, data){
            if(err) throw err;
            else{
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('appId')) {
        redShiftClient.query(`select * from main where appid = '${req.param('appId')}' order by timestamp desc`, {}, function (err, data) {
            if (err) throw err;
            else {
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('days')) {
        redShiftClient.query(`select * from main where timestamp > current_date - interval '${req.param('days')} day';`, {}, function (err, data) {
            if (err) throw err;
            else {
                res.end(JSON.stringify(data));
            }
        });
    } else if (req.param('daysFrom') && req.param('daysTo')) {
        redShiftClient.query(`select * from main where timestamp > current_date - interval '${req.param('daysFrom')} day' and timestamp < current_date - interval '${req.param('daysTo')} day' order by timestamp desc;`, {}, function(err, data){
            if(err) throw err;
            else{
                res.end(JSON.stringify(data));
            }
        });
    } else {
        redShiftClient.query('select * from main order by timestamp desc limit 500', {}, function(err, data){
            if(err) throw err;
            else{
                res.end(JSON.stringify(data));
            }
        });
    }

});

app.get('/api/builds', async (req, res) => {
    try {
        accounts.setAWSConfig(req.query['region']);
        const codebuild = new aws.CodeBuild();
        let builds = [];

        let buildIds = await codebuild.listBuildsForProject({'projectName': req.query['project']}).promise();
        let codebuildBuilds = await codebuild.batchGetBuilds({'ids': buildIds['ids']}).promise();
        let token = buildIds.nextToken;

        builds = builds.concat(codebuildBuilds.builds);
        while (token) {
            let buildIds = await codebuild.listBuildsForProject({'projectName': req.query['project'], 'nextToken': token}).promise();
            let codebuildBuilds = await codebuild.batchGetBuilds({'ids': buildIds['ids']}).promise();
            builds = builds.concat(codebuildBuilds.builds);

            token = (token !== buildIds.nextToken) ? buildIds.nextToken : null;
        }

        res.end(JSON.stringify({'builds': builds}));
    } catch (err) {
        res.end(JSON.stringify({'error': err}));
    }
});

app.get('/api/logs', (req, res) => {
    try {
        accounts.setAWSConfig(req.query['region']);

        const cloudwatchlogs = new aws.CloudWatchLogs();
        cloudwatchlogs.getLogEvents({'logGroupName': req.query['logGroupName'], 'logStreamName': req.query['logStreamName']}, function(err, data) {
            if (err) res.end(JSON.stringify(err)); // an error occurred
            else     res.end(JSON.stringify(data));           // successful response
        });
    } catch (err) {
        res.end(JSON.stringify({'error': err}));
    }

});

app.get('/api/cachemeta', (req, res) => {
    try {
        const appId = req.query['appId'];
        const branchName = req.query['branchName'];
        const region = req.query['region'];
        accounts.setAWSConfig(region);
        const params = {
            Bucket: 'aws-amplify-prod-' + region + '-artifacts',
            Key: appId + '/' + branchName + '/BUILD/cache.tar'
        };
        console.log(params);
        new aws.S3().headObject(params, function(err, data) {
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

app.listen(config.port);

console.log('App is listening on port ' + config.port);
