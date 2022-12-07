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
        
        let logs;

        try {
            logs = JSON.parse(unZippedData.toString("ascii"));
        } catch (error) {
            console.error("Error parsing unZippedData: " + unZippedData.toString("ascii"), error);
            return;
        }

        var service = logs.logGroup
        console.log(logs)
        var account = logs.owner;
        logs.logEvents.forEach(log => logEvents.push({
            message: JSON.stringify({
                log: transformMessage(log.message, service),
                region:getRegion(account),
                service: service
            }),
            timestamp: Number(log.timestamp)
        }))
    })

    logEvents.sort((a, b) => a.timestamp - b.timestamp);

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
    try {
        await cloudwatchlogs.putLogEvents(putLogEventsParams).promise();
    } catch (error) {
        console.error("Error publishing logs", error);
    }
};

const transformMessage = (message, service) => {
    const buildServiceLogGroups = [
        "AWSCodeBuild",
        "PostJobHandler",
        "GitHubValidationHandler",
        "IncomingWebhookHandler",
        "CodeCommitHandler",
        "JobHealthCheck",
        "WebHookHandler",
        "WebPreviewHandler",
        "TriggerBuild",
        "RunNextJob",
        "BuildSecretsHandler",
        "AmplifyWebhookAPIAccessLogs",
        "AmplifyWebhookPreviewAPIAccessLogs",
        "AmplifyIncomingWebhookAPIAccessLogs",
        "AmplifyCodeCommitWebhookAPIAccessLogs"
    ];

    const isBuildService = buildServiceLogGroups.findIndex(logGroup => service.includes(logGroup));

    if (isBuildService === -1) {
        return message;
    }

    const messageParts = message.split(" CloudWatchMetricsHelper: ");

    if (messageParts.length === 2) {
        message = messageParts[1];
    }

    try {
        const jsonMessage = JSON.parse(message);
        return jsonMessage;
    } catch (e) {
        console.error("Error parsing JSON", e);
    }

    return message;
};
