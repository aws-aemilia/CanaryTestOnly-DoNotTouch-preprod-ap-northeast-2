console.log('Loading function');
var zlib = require('zlib');
exports.handler = function(input, context) {
    console.log(JSON.stringify(input, null, 2));
    input.Records.forEach(function(record) {
        var payload = Buffer.from(record.kinesis.data, 'base64');
        zlib.gunzip(payload, function(e, result) {
            if (e) { 
                context.fail(e);
            } else {
                result = JSON.parse(result.toString('ascii'));
                console.log("Event Data:", JSON.stringify(result, null, 2));
                context.succeed();
            }
        });
    });
};
