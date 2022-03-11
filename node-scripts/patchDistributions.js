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
  // if(process.argv.length !=3 || isNaN(process.argv[2])) {
  //   console.log(`Usage: node patchDistributions.js maxVersion`);
  //   return;
  // }
  // let maxVersion = Number(process.argv[2]);
  const OAI_PREFIX = 'origin-access-identity/cloudfront';
  //TEST EM7BM2RKELW1H
  const OAI_TO_ROTATE = `${OAI_PREFIX}/E2491UISJ9XA03`; 
  
  //TEST E2491UISJ9XA03
  const OAI_TARGET = `${OAI_PREFIX}/EM7BM2RKELW1H`;
  const client = new CloudFront();
    if (fs.existsSync(patchDistributionsFileName)) {
      const patchDistributions = fs.readJSONSync(
        patchDistributionsFileName
      );

      for await (const distribution of patchDistributions) {
        //throttle rate
        await limiter.removeTokens(2);
        try {
          console.log(`Processing: ${distribution[0]}`);
          // Get Distribution
          const getDistributionRequest = {
            Id: distribution[0],
          };
          let getDistributionResult = await client.getDistribution(
            getDistributionRequest
          );

          let needsUpdate = false;
          origins = getDistributionResult.Distribution.DistributionConfig.Origins;
          // console.log(getDistributionResult.Distribution.DistributionConfig.Origins.Items)
          getDistributionResult.Distribution.DistributionConfig.Origins.Items.forEach(
            (origin) => {
              if (origin.S3OriginConfig && origin.S3OriginConfig.OriginAccessIdentity === OAI_TO_ROTATE) {
                needsUpdate = true;
                console.log(`Found OAI to rotate: ${OAI_TO_ROTATE} on distribution id ${getDistributionResult.Distribution.Id}, replacing it with ${OAI_TARGET}`);
                origin.S3OriginConfig.OriginAccessIdentity = OAI_TARGET;
              }
            }
          )

          /*
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
          */
          
          if(needsUpdate) {
            let updateDistributionRequest = {
              Id: distribution[0],
              DistributionConfig: {
                ...getDistributionResult.Distribution.DistributionConfig,
              },
              IfMatch: getDistributionResult.ETag,
            };

            
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
