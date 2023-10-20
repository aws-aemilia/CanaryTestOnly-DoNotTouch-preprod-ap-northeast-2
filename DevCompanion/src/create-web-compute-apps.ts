import { Amplify, JobType, UpdateAppCommand } from "@aws-sdk/client-amplify";
import dotenv from "dotenv";

// Bring in environment variables from .env file
dotenv.config();

const amplify = new Amplify({
  endpoint: process.env.ENDPOINT_GAMMA,
  region: process.env.REGION_GAMMA,
});

const OAUTH_TOKEN = process.env.GITHUB_OAUTH_TOKEN;
const TWENTY_SECONDS = 20000;
const REPO_NAME = "dev-web-compute";
const APP_NAME_PREFIX = "dev-web-compute";
const START_INDEX = 0;
const HOW_MANY_APPS = 1;
const IS_STATIC_ASSET_SEPARATED = false;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createWebComputeApp({
  name,
  branchName = "main",
  repository = `https://github.com/terodox/${REPO_NAME}`,
  isStaticAssetSeparated = false,
}: {
  name: string;
  branchName?: string;
  repository?: string;
  isStaticAssetSeparated?: boolean;
}) {
  const appRes = await amplify.createApp({
    buildSpec:
      "version: 1\n" +
      "frontend:\n" +
      "  phases:\n" +
      "    preBuild:\n" +
      "      commands:\n" +
      "        - npm ci\n" +
      "    build:\n" +
      "      commands:\n" +
      "        - npm run build\n" +
      "  artifacts:\n" +
      "    baseDirectory: .next\n" +
      "    files:\n" +
      "      - '**/*'\n" +
      "  cache:\n" +
      "    paths:\n" +
      "      - node_modules/**/*\n" +
      "",
    customRules: [{ source: "/<*>", target: "/index.html", status: "404-200" }],
    environmentVariables: {
      STATIC_ASSET_SEPARATION_BETA_ENABLED: isStaticAssetSeparated
        ? "ENABLED"
        : "nope",
    },
    name,
    oauthToken: OAUTH_TOKEN,
    platform: "WEB_COMPUTE",
    repository,
    iamServiceRoleArn: `arn:aws:iam::${process.env.ACCOUNT_ID_ME}:role/AmplifyBackendDeploymentsRole`,
  });

  if (!appRes.app) {
    throw new Error("Couldn't create app.");
  }

  const { appId } = appRes.app;

  if (!appId) {
    throw new Error("no appId");
  }

  console.log("Created App");
  console.log(`appId: ${appId}`);

  await createBranch(appId, branchName);

  console.log(`name: ${name}`);

  return { appId, branchName };
}

async function createBranch(appId: string, branchName: string) {
  const branchRes = await amplify.createBranch({
    appId,
    branchName,
    enableNotification: false,
    framework: "Next.js - SSR",
    stage: "PRODUCTION",
  });

  if (!branchRes.branch) {
    throw new Error("Couldn't create branch " + branchName);
  }
}

async function updateToStaticAssetSeparated(appId: string) {
  await amplify.updateApp({
    appId,
    environmentVariables: {
      STATIC_ASSET_SEPARATION_BETA_ENABLED: "ENABLED",
    },
  });
}

async function releaseApp(appId: string, branchName: string) {
  const jobRes = await amplify.startJob({
    appId,
    branchName,
    jobType: JobType.RELEASE,
  });

  if (!jobRes.jobSummary) {
    return;
  }

  console.log(`Created job for ${appId}/${branchName}`);

  const { jobSummary } = jobRes;

  let buildIsRunning = true;
  let currentStatus;

  while (buildIsRunning) {
    const { job } = await amplify.getJob({
      appId,
      branchName,
      jobId: jobSummary.jobId,
    });

    if (!job) {
      throw new Error("no job");
    }

    currentStatus = job!.summary!.status;

    if (
      currentStatus === "CANCELLING" ||
      currentStatus === "RUNNING" ||
      currentStatus === "PENDING" ||
      currentStatus === "PROVISIONING"
    ) {
      buildIsRunning = true;
    } else {
      buildIsRunning = false;
    }

    await sleep(TWENTY_SECONDS);
  }

  console.log(`current status: ${currentStatus}`);
}

async function main() {
  const allAppsAndBranches: { appId: string; branchName: string }[] = [];
  for (let i = START_INDEX; i < START_INDEX + HOW_MANY_APPS; i++) {
    const { appId, branchName } = await createWebComputeApp({
      name: `${APP_NAME_PREFIX}-${i.toString().padStart(3, "0")}`,
      isStaticAssetSeparated: IS_STATIC_ASSET_SEPARATED,
    });
    allAppsAndBranches.push({ appId, branchName });
  }

  await sleep(1000);

  const allReleaseRequests = allAppsAndBranches.map(
    async ({ appId, branchName }) => {
      await releaseApp(appId, branchName);
    }
  );

  await Promise.all(allReleaseRequests);
}

main().catch((e) => {
  console.log("Failed to run main", e);

  process.exit(1);
});
