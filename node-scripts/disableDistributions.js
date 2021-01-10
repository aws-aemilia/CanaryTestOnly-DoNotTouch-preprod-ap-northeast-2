`use strict`;
const { CloudFront } = require("@aws-sdk/client-cloudfront");
const fs = require("fs-extra");
const orphanedDistributionsFileName = "orphanedDistributions.json";

const run = async () => {
  const client = new CloudFront({});
  try {
    if (fs.existsSync(orphanedDistributionsFileName)) {
      const orphanedDistributions = fs.readJSONSync(
        orphanedDistributionsFileName
      );

      orphanedDistributions.forEach(async distribution => {
        // Get Distribution and disable
        const getDistributionRequest = {
          Id: distribution[0]
        };
        let getDistributionResult = await client.getDistribution(
          getDistributionRequest
        );
        getDistributionResult.Distribution.DistributionConfig.Enabled = false;

        let updateDistributionRequest = {
          Id: distribution[0],
          DistributionConfig: {
            ...getDistributionResult.Distribution.DistributionConfig
          },
          IfMatch: getDistributionResult.ETag
        };

        //Update Distribution
        await client.updateDistribution(updateDistributionRequest);
      });
    }
  } catch (error) {
    console.log("An error occurred" + error);
  }
};
run();
