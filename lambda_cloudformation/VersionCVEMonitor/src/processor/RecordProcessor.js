const helper = require( "../utils/cveHelper.js");

module.exports = {
    processRecord: async (record) => {
        // Verify CVE record is related to Google Chrome
        if (!helper.isChromeCVE(record)) {
            return;
        }
        // Get history record from DDB table
        const historyRecord = await helper.getRecord(record);

        // Update history record table and Send notification for this new CVE record
        if (historyRecord.Item == null) {
            await helper.putRecord(record);
            await helper.sendNotification(record);
        }
        return;
    },
};
