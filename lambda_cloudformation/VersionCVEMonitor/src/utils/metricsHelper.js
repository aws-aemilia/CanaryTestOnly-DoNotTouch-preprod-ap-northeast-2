const AWS = require("aws-sdk");
const cloudWatch = new AWS.CloudWatch();

module.exports = {
    postStatusMetrics: async (success) => {
        const metricData = [
            {
                MetricName: "CVEMonitorStatus",
                Unit: "Count",
                Value: success ? 1.0 : 0.0,
                Timestamp: new Date(),
                Dimensions: [
                    {
                        Name: "Status",
                        Value: "Success",
                    },
                ],
            },
        ];
        await postMetrics(metricData);
    },
};

async function postMetrics(metricData) {
    await cloudWatch
        .putMetricData({
            Namespace: "VersionCVEMonitorLambda",
            MetricData: metricData,
        })
        .promise();
}
