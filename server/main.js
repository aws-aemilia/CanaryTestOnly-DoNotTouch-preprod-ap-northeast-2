const express = require('express');
const path = require('path');
const config = require('./config');
const redShiftClient = config.db.get();
const { execSync } = require('child_process');
const aws = require('aws-sdk');

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

app.get('/api/builds', async (req, res) => {
    setAWSConfig(req.query['region']);
    const codebuild = new aws.CodeBuild();
    let builds = [];

    try {
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
    setAWSConfig(req.query['region']);

    const cloudwatchlogs = new aws.CloudWatchLogs();
    cloudwatchlogs.getLogEvents({'logGroupName': req.query['logGroupName'], 'logStreamName': req.query['logStreamName']}, function(err, data) {
        if (err) res.end(JSON.stringify(err)); // an error occurred
        else     res.end(JSON.stringify(data));           // successful response
    });
});

// Handles any requests that don't match the ones above
app.get('*', (req,res) =>{
    res.sendFile(path.join(__dirname+'/../client/build/index.html'));
});

app.listen(config.port);

console.log('App is listening on port ' + config.port);

function setAWSConfig(region) {
    let material = null;
    switch (region) {
        case 'eu-west-1':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.565036926641.user/ReadOnlyLogs').toString();
            break;
        case 'us-east-1':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.073653171576.user/ReadOnlyLogs').toString();
            break;
        case 'us-west-2':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.395333095307.user/ReadOnlyLogs').toString();
            break;
        case 'eu-west-2':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential  com.amazon.credentials.isengard.499901155257.user/ReadOnlyLogs').toString();
            break;
        case 'ap-southeast-2':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.711974673587.user/ReadOnlyLogs').toString();
            break;
        case 'us-east-2':
            material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.499901155257.user/ReadOnlyLogs ').toString();
            break;
    }

    const creds= new aws.Credentials();
    creds.accessKeyId = material.split('\n')[0];
    creds.secretAccessKey = material.split('\n')[1];

    aws.config.update({region: region, credentials: creds});
}
