import { Amplify, JobType } from "@aws-sdk/client-amplify";
import dotenv from "dotenv";

// Bring in environment variables from .env file
dotenv.config();

const APP_NAME_PREFIX = "gamma-static-app";

// Andy dev stack
const amplify = new Amplify({
  endpoint: process.env.ENDPOINT_GAMMA,
  region: process.env.REGION_GAMMA,
});

(async function () {
  const listAppsResponse = await amplify.listApps({});
  const allApps = listAppsResponse.apps;
  console.log({ allApps });
  const allDeleteRequests = allApps
    ?.filter((app) => app.name?.includes(APP_NAME_PREFIX))
    .map(async (app) => {
      console.log(`Deleting: ${app.name}`);
      return amplify.deleteApp({ appId: app.appId });
    });

  if (!allDeleteRequests) {
    console.log("No apps returned...");
    return;
  }

  await Promise.all(allDeleteRequests);
})().catch(console.error);
