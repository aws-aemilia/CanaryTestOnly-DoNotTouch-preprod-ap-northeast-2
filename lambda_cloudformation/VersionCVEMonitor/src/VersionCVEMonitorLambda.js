const axios = require("axios");
const CVEUrl =
    "https://www.cvedetails.com/json-feed.php?numrows=30&vendor_id=0&product_id=0&version_id=0&hasexp=0&opec=0&opov=0&opcsrf=0&opfileinc=0&opgpriv=0&opsqli=0&opxss=0&opdirt=0&opmemc=0&ophttprs=0&opbyp=0&opginf=0&opdos=0&orderby=2&cvssscoremin=0";
const { processRecord } = require("./processor/RecordProcessor");
const { postStatusMetrics } = require("./utils/metricsHelper");

exports.handler = async (event, context) => {
    // Get CVE update
    try {
        const records = await axios.get(CVEUrl);
        for (let record of records.data) {
            await processRecord(record);
        }
        await postStatusMetrics(true);
    } catch (err) {
        await postStatusMetrics(false);
        console.log(err);
    }
};
