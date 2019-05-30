const aws = require('aws-sdk');

const patchSdk = require('../sdkpatcher');
const {getAccountId} = require('../accounts');

// "arn:aws:sqs:us-west-2:033345365959:beta-us-west-2-MeteringDeriverQueueDLQ",
// "arn:aws:sqs:us-west-2:033345365959:beta-us-west-2-MeteringREMOQueueDLQ",
// "arn:aws:sqs:us-west-2:033345365959:beta-us-west-2-MeteringStandardQueueDLQ"
const getQueueName = (stage, region, type) => `${stage}-${region}-Metering${type}QueueDLQ`;
const getQueueUrl = (stage, region, type, accountId) => `https://sqs.${region}.amazonaws.com/${accountId}/${getQueueName(stage, region, type)}`;

const getMessages = async (req, res) => {
    const region = req.query['region'];
    const stage = req.query['stage'];
    const type = req.query['type'];
    if (!region || !stage || !type) {
        res.status(400);
        res.json({message: 'Stage, region, and type all must be specified'});
        return;
    }
    let sqs;
    try {
        sqs = await patchSdk(stage, region, aws.SQS);
    } catch (error) {
        res.status(400);
        res.json({message: 'assume role failed', error});
        return;
    }
    const accountId = getAccountId(stage, region);
    const params = {
        QueueUrl: getQueueUrl(stage, region, type, accountId),
        MaxNumberOfMessages: 10
    };
    let result;
    try {
        result = await sqs.receiveMessage(params).promise();
        console.log(result);
        if (!result.Messages) {
            res.json({message: 'No messages found in queue'});
            return;
        }
    } catch (error) {
        console.log(params);
        console.log(error);
        res.status(400);
        res.json({message: 'sqs call failed', error});
        return;
    }
    if (type === 'REMO') {
        try {
            const badArns = require('../../static/impacted_branches.json');
            const messages = result.Messages;
            const notFoundMessages = [];
            let foundMessages = [];
            messages.forEach((message) => {
                const body = JSON.parse(message.Body);
                if (!body.branchArn || badArns.indexOf(body.branchArn) < 0 || body.operation !== 'DELETE') {
                    notFoundMessages.push(message);
                } else {
                    foundMessages.push(message);
                }
            });
            res.json({foundMessages, notFoundMessages, messages});
        } catch (e) {
            console.log('parsing failed');
            console.log(e);
            res.status(400);
            res.json({message: 'Parsing failed'});
        }
    } else {
        res.json({messages: result.Messages});
    }
};

const deleteMessage = async (req, res) => {
    const region = req.query['region'];
    const stage = req.query['stage'];
    const type = req.query['type'];
    console.log(req.body);
    const handle = req.body['ReceiptHandle'];
    console.log(handle);
    if (!region || !stage || !type || !handle) {
        res.status(400);
        res.json({message: 'Stage, region, type, and handle all must be specified'});
        return;
    }
    let sqs;
    try {
        sqs = await patchSdk(stage, region, aws.SQS);
    } catch (error) {
        console.log(error);
        res.status(400);
        res.json({message: 'assume role failed', error});
        return;
    }
    const accountId = getAccountId(stage, region);
    const params = {
        QueueUrl: getQueueUrl(stage, region, type, accountId),
        ReceiptHandle: handle
    };
    try {
        const result = await sqs.deleteMessage(params).promise();
        console.log('Deleted successfully');
        console.log(result);
        res.json(result);
    } catch (error) {
        console.log(params);
        console.log(error);
        res.status(400);
        res.json({message: 'error deleting message', error})
    }
};

module.exports = {
    getMessages,
    deleteMessage
};
