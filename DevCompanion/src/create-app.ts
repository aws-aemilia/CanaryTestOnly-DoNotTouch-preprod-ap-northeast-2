import { Amplify, JobType } from "@aws-sdk/client-amplify";
import dotenv from "dotenv";

// Bring in environment variables from .env file
dotenv.config();

// Andy dev stack
const endpoint = process.env.ENDPOINT_ME;
const region = process.env.REGION;
const oauthToken = process.env.GITHUB_OAUTH_TOKEN;
const TWENTY_SECONDS = 20000;
const REPO_NAME = "dev-stack-static-app";

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

const amplify = new Amplify({
  region,
  endpoint,
});

type AppProps = {
  name: string;
  branchName?: string;
  repository?: string;
};

async function createStaticApp({
  name,
  branchName = "main",
  repository = `https://github.com/terodox/${REPO_NAME}`,
}: AppProps) {
  let appRes;
  try {
    appRes = await amplify.createApp({
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
        "    baseDirectory: build\n" +
        "    files:\n" +
        "      - '**/*'\n" +
        "  cache:\n" +
        "    paths:\n" +
        "      - node_modules/**/*\n" +
        "",
      customRules: [
        { source: "/<*>", target: "/index.html", status: "404-200" },
        {
          source:
            "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|ttf|map|json)$)([^.]+$)/>",
          status: "200",
          target: "/index.html",
        },
      ],
      environmentVariables: {},
      name,
      oauthToken,
      platform: "WEB",
      repository,
    });
  } catch (error) {
    console.error(error);
    throw error;
  }

  if (!appRes.app) {
    throw new Error("Couldn't create app.");
  }

  const { appId } = appRes.app;

  if (!appId) {
    throw new Error("no appId");
  }

  console.log("Created App");
  console.log(`appId: ${appId}`);

  const branchRes = await amplify.createBranch({
    appId,
    branchName,
    enableNotification: false,
    framework: "React",
    stage: "PRODUCTION",
  });

  if (!branchRes.branch) {
    throw new Error("Couldn't create branch " + branchName);
  }

  console.log(`branchName: ${name}`);

  return { appId, branchName };
}

async function releaseApp(appId: string, branchName: string) {
  const amplify = new Amplify({
    region,
    endpoint,
  });

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
  for (let i = 1; i <= 2; i++) {
    const { appId, branchName } = await createStaticApp({
      name: `${REPO_NAME}-${i.toString().padStart(3, "0")}`,
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
