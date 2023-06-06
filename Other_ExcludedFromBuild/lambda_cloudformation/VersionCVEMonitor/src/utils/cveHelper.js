const AWS = require("aws-sdk");
const CVE_record_history_table = process.env.CVE_RECORD_HISTORY_TABLE;

module.exports = {
    isChromeCVE: (record) => {
        const keyword = "Google Chrome";
        const cveSummary = record.summary;

        return cveSummary.includes(keyword);
    },

    getRecord: async (record) => {
        const ddb = new AWS.DynamoDB.DocumentClient();
        const cveId = record.cve_id;
        const getParams = {
            TableName: CVE_record_history_table,
            Key: {
                cveId: cveId,
            },
        };

        try {
            const history_record = await ddb.get(getParams).promise();
            return history_record;
        } catch (err) {
            throw err;
        }
    },

    putRecord: async (record) => {
        const ddb = new AWS.DynamoDB.DocumentClient();
        const cveId = record.cve_id;
        const cveSummary = record.summary;
        const cveUrl = record.url;
        const putParams = {
            TableName: CVE_record_history_table,
            Item: {
                cveId: cveId,
                summary: cveSummary,
                url: cveUrl,
            },
        };

        try {
            await ddb.put(putParams).promise();
        } catch (err) {
            throw err;
        }

        return;
    },

    sendNotification: async (record) => {
        const ses = new AWS.SES({ region: "us-west-2" });
        const cveId = record.cve_id;
        const cveSummary = record.summary;
        const cveUrl = record.url;
         
        const notificationMessage = `Immediate Action required! New Google Chrome ${cveId} found, CVE summary is : ${cveSummary}, CVE url is: ${cveUrl}, ` 
        const emailParams = {
            Destination: {
                ToAddresses: ["aws-mobile-amplify@amazon.com"],
            },
            Message: {
                Body: {
                    Text: { Data: notificationMessage },
                },

                Subject: { Data: `IMPORTANT: [Evaluation Required] !!!! New Google Chrome CVE: ${cveId}` },
            },
            Source: "aws-mobile-amplify@amazon.com",
        };

        try {
            await ses.sendEmail(emailParams).promise();
        } catch (err) {
            throw err;
        }
        return;
    },

};
