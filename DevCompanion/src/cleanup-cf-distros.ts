// import AWS from "aws-sdk";
// import { DistributionSummaryList } from 'aws-sdk/clients/cloudfront';
// import { PromiseResult } from 'aws-sdk/lib/request';
// import { program } from 'commander';
// import prompts from 'prompts';

// program.option('--delete-only');
// program.parse();
// const options = program.opts();

// const cloudfront = new AWS.CloudFront();

// const ALLOWED_DESCRIPTIONS = ['Amplify placeholder'];

// async function main() {
//   const distributions = await getAllDistributions();

//   const allowedDistributions = distributions.filter((distribution) =>
//     ALLOWED_DESCRIPTIONS.includes(distribution.Comment),
//   );

//   if (allowedDistributions) {
//     console.log(`Removing ${allowedDistributions.length} distros...`);

//     let count = 0;
//     if (!options.deleteOnly) {
//       for (const distribution of allowedDistributions) {
//         console.log(distribution.Comment);
//         try {
//           count++;
//           console.log(`[${count}]Disabling Id: ${distribution.Id}`);
//           console.log(await getStatus(distribution.Id));
//           await disableDistro(distribution.Id);
//           console.log('Completed:', distribution.Id);
//         } catch (error) {
//           console.error(error);
//           console.log(`${distribution.Id} FAILED to disable... Continuing`);
//         }
//         await sleep(2000);
//       }

//       await checkShouldContinue();
//     }

//     console.log('\n\n\n\nMOVING ON TO REMOVAL\n\n\n\n');

//     count = 0;
//     for (const distribution of allowedDistributions) {
//       try {
//         count++;
//         console.log(`[${count}]Removing Id: ${distribution.Id}`);
//         console.log(await getStatus(distribution.Id));
//         await deleteDistro(distribution.Id);
//         console.log('Completed:', distribution.Id);
//       } catch (error) {
//         console.error(error);
//         console.log(`${distribution.Id} FAILED to delete... Continuing`);
//       }
//       await sleep(2000);
//     }
//   }
// }

// async function getAllDistributions() {
//   let allDistros: DistributionSummaryList = [];
//   let currentDistroResponse: PromiseResult<AWS.CloudFront.ListDistributionsResult, AWS.AWSError>;
//   do {
//     currentDistroResponse = await cloudfront.listDistributions().promise();
//     allDistros = allDistros.concat(currentDistroResponse.DistributionList?.Items || []);
//     console.log(currentDistroResponse.DistributionList?.NextMarker);
//   } while (currentDistroResponse.DistributionList?.NextMarker);

//   return allDistros;
// }

// async function sleep(timeInMs: number) {
//   return new Promise((resolve) => setTimeout(resolve, timeInMs));
// }

// async function removeDistribution(distributionId: string) {
//   await disableDistro(distributionId);

//   await pollForDisabled(distributionId);

//   await deleteDistro(distributionId);
// }

// async function getStatus(distro: string) {
//   const getResponse = await cloudfront
//     .getDistribution({ Id: distro })
//     .promise();
//   return getResponse.Distribution!.Status;
// }

// async function pollForDisabled(distributionId: string) {
//   let status;
//   do {
//     sleep(500);
//     status = await getStatus(distributionId);
//     console.log("Waiting for distro to disable... Status:", status);
//   } while (status !== "Disabled");
// }

// async function deleteDistro(distro: string) {
//   const response = await cloudfront
//     .getDistributionConfig({
//       Id: distro,
//     })
//     .promise();

//   await cloudfront
//     .deleteDistribution({
//       Id: distro,
//       IfMatch: response.ETag,
//     })
//     .promise();
// }

// async function disableDistro(distro: string) {
//   const response = await cloudfront
//     .getDistributionConfig({
//       Id: distro,
//     })
//     .promise();

//   await cloudfront
//     .updateDistribution({
//       Id: distro,
//       IfMatch: response.ETag,
//       DistributionConfig: <any>{
//         ...response.DistributionConfig,
//         Enabled: false,
//       },
//     })
//     .promise();
// }

// async function checkShouldContinue() {
//   const response = await prompts({
//     type: "confirm",
//     name: "shouldContinueNow",
//     message: "Should we continue now?",
//   });

//   console.log(response.shouldContinueNow);
//   if (!response.shouldContinueNow) {
//     process.exit(0);
//   }
// }

// main();
