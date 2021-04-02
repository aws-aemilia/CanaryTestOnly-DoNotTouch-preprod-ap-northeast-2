const AWS = require('aws-sdk');
const cloudwatchlogs = new AWS.CloudWatchLogs();
const {getRegion} = require('../helpers/accountHelper')
var zlib = require("zlib");

exports.handler = async function(input, context) {
    let logEvents = [];
    input.Records.forEach(function(record) {
        var payload = Buffer.from(record.kinesis.data, "base64");
        var unzippedData = zlib.gunzipSync(payload)
        var logs = JSON.parse(unzippedData.toString("ascii"));
        console.log(logs)
        var account = logs.owner;
        logs.logEvents.forEach(log => logEvents.push({
            message: JSON.stringify({log: log.message, region:getRegion(account)}),
            timestamp: Number(log.timestamp)
        }))
    })

    let logStreamName = Date.now().toString()

    var createLogStreamParams = {
        logGroupName: "Reporting/WarmingPool",
        logStreamName: logStreamName 
    };
    await cloudwatchlogs.createLogStream(createLogStreamParams).promise()

    var putLogEventsParams = {
        logEvents: logEvents,
        logGroupName: "Reporting/WarmingPool",
        logStreamName: logStreamName,
    };
    await cloudwatchlogs.putLogEvents(putLogEventsParams).promise();
};
