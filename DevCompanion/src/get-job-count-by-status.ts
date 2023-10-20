import { Amplify } from "@aws-sdk/client-amplify";
import dotenv from "dotenv";
import { createSpinner } from "nanospinner";

dotenv.config();

const spinner = createSpinner("Loading...").start();

(async function () {
  const amplify = new Amplify({
    endpoint: process.env.ENDPOINT_ME,
    region: process.env.REGION,
  });

  const appsResponse = await amplify.listApps({});
  appsResponse.apps!.map(async (App) =>
    console.log(`${App.appId} - ${App.name}`)
  );

  while (1) {
    const listJobsRequests = appsResponse.apps!.map(async (App) => {
      const listJobsResponse = await amplify.listJobs({
        appId: App.appId,
        branchName: "main",
      });

      return {
        appId: App.appId,
        listJobsResponse,
      };
    });

    const allJobResponses = await Promise.all(listJobsRequests);

    const jobCountByStatus: { [key: string]: number } = {};
    allJobResponses.forEach(({ appId, listJobsResponse }) => {
      if (listJobsResponse.jobSummaries?.length || 0 > 0) {
        listJobsResponse.jobSummaries?.forEach((jobSummary) => {
          const jobStatus = jobSummary.status;
          if (!jobStatus) {
            return;
          }
          if (!jobCountByStatus[jobStatus]) {
            jobCountByStatus[jobStatus] = 1;
          } else {
            jobCountByStatus[jobStatus] += 1;
          }
        });
      }
    });
    spinner.update({ text: JSON.stringify(jobCountByStatus) });
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
})().catch(console.error);
