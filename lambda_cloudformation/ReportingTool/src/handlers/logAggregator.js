const AWS = require('aws-sdk');
const cloudwatchlogs = new AWS.CloudWatchLogs();
const getRegion = require('../regionHelper')
const { v4: uuidv4 } = require('uuid');
const zlib = require("zlib");

exports.handler = async function(input, context) {
    let logEvents = [];

    input.Records.forEach(function(record) {
        var payload = Buffer.from(record.kinesis.data, "base64");
        var unZippedData = zlib.gunzipSync(payload)
        var logs = JSON.parse(unZippedData.toString("ascii"));
        var service = logs.logGroup
        console.log(logs)
        var account = logs.owner;
        logs.logEvents.forEach(log => logEvents.push({
            message: JSON.stringify({log: log.message, region:getRegion(account), service: service}),
            timestamp: Number(log.timestamp)
        }))
    })

    let logStreamName = uuidv4().replace(/-/g, '');

    var createLogStreamParams = {
        logGroupName: "ServiceLogs",
        logStreamName: logStreamName 
    };
    await cloudwatchlogs.createLogStream(createLogStreamParams).promise()

    var putLogEventsParams = {
        logEvents: logEvents,
        logGroupName: "ServiceLogs",
        logStreamName: logStreamName,
    };
    await cloudwatchlogs.putLogEvents(putLogEventsParams).promise();
};
