`use strict`;
const { CloudFront } = require("@aws-sdk/client-cloudfront");
const fs = require("fs-extra");
const orphanedDistributionsFileName = "orphanedDistributions.json";

const run = async () => {
  const client = new CloudFront({region: "ap-south-1"});
  try {
    if (fs.existsSync(orphanedDistributionsFileName)) {
      const orphanedDistributions = fs.readJSONSync(
        orphanedDistributionsFileName
      );

      orphanedDistributions.forEach(async distribution => {

        const getDistributionRequest = {
            Id: distribution[0]
          };
          let getDistributionResult = await client.getDistribution(
            getDistributionRequest
          );
        
        const deleteDistributionRequest = {
          Id: distribution[0],
          IfMatch: getDistributionResult.ETag
        };
        await client.deleteDistribution(deleteDistributionRequest);

      });
    }
  } catch (error) {
    console.log("An error occurred" + error);
  }
};
run();
