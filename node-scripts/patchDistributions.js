`use strict`;
const { CloudFront } = require("@aws-sdk/client-cloudfront");
const fs = require("fs-extra");
const patchDistributionsFileName = "patchDistributions.json";
const {RateLimiterMemory, RateLimiterQueue} = require('rate-limiter-flexible');
const limiterFlexible = new RateLimiterMemory({
  points: 10,
  duration: 60, // 1 minute
});
const limiter = new RateLimiterQueue(limiterFlexible);

const run = async () => {
  if(process.argv.length !=3 || isNaN(process.argv[2])) {
    console.log(`Usage: node patchDistributions.js maxVersion`);
    return;
  }
  let maxVersion = Number(process.argv[2]);
  const client = new CloudFront();
    if (fs.existsSync(patchDistributionsFileName)) {
      const patchDistributions = fs.readJSONSync(
        patchDistributionsFileName
      );

      for await (const distribution of patchDistributions) {
        try {
          console.log(`Processing: ${distribution[0]}`);
          // Get Distribution
          const getDistributionRequest = {
            Id: distribution[0],
          };
          let getDistributionResult = await client.getDistribution(
            getDistributionRequest
          );

          let needsUpdate = true;
          getDistributionResult.Distribution.DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.Items.forEach(
            (association) => {
              //increment lambda function name, leave the rest as is.
              let before = association.LambdaFunctionARN;
              association.LambdaFunctionARN = association.LambdaFunctionARN.replace(/_v(\d+):/,function(all, version, offset, string){
                let currentValue = Number(version);
                return (currentValue<maxVersion) ? `_v${Number(version)+1}:` : all;
              });
              console.log(`Before: ${before}\nAfter: ${association.LambdaFunctionARN}`);
              if(before == association.LambdaFunctionARN) {
                console.log(`Skipping update, already @maxVersion: ${distribution[0]}`);
                needsUpdate = false;
              }
            }
          );
          if(needsUpdate) {
            let updateDistributionRequest = {
              Id: distribution[0],
              DistributionConfig: {
                ...getDistributionResult.Distribution.DistributionConfig,
              },
              IfMatch: getDistributionResult.ETag,
            };
            
            //throttle rate if we need to update
            await limiter.removeTokens(1);
            
            //Update Distribution
            console.log(`Updating: ${distribution[0]}`);
            await client.updateDistribution(updateDistributionRequest);
            console.log(`Updated: ${distribution[0]}`);
          }
        } catch (error) {
          console.log("An error occurred:", error.message);
        }
      };
    }
};
run();
