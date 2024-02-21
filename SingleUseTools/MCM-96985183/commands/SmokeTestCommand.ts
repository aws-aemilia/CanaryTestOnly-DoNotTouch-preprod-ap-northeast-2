import { Amplify, CreateAppCommandOutput } from "@aws-sdk/client-amplify";
import { Region, Stage } from "Commons/Isengard";
import logger from "Commons/utils/logger";
import { GENIE_BASE_URL } from "../lib";
import { setTimeout } from "timers/promises";

export class SmokeTestCommand {
  private stage: Stage;
  private amplify: Amplify;
  private branchName: string;
  private repository?: string;
  private accessToken?: string;

  constructor({
    stage,
    amplify,
    branchName,
    repository,
    accessToken,
  }: {
    stage: Stage;
    amplify: Amplify;
    branchName: string;
    repository?: string;
    accessToken?: string;
  }) {
    this.stage = stage;
    this.amplify = amplify;
    this.branchName = branchName;
    this.repository = repository;
    this.accessToken = accessToken;
  }

  public static async buildDefault(
    stage: Stage,
    region: Region,
    branchName: string,
    repository?: string,
    accessToken?: string,
    endpoint?: string
  ): Promise<SmokeTestCommand> {
    return new SmokeTestCommand({
      stage,
      amplify: new Amplify({
        region,
        endpoint,
      }),
      branchName,
      repository,
      accessToken,
    });
  }

  public async execute(appId?: string) {
    if (!appId) {
      const createAppCommandOutput = await this.createApp();
      appId = createAppCommandOutput.app?.appId;

      if (!appId) {
        throw new Error("Failed to create app");
      }

      logger.info(`App created: ${appId}`);

      await this.createBranch(appId);

      logger.info(`Branch created: ${this.branchName}`);
    }

    const startJobCommandOutput = await this.runBuild(appId);
    const jobId = startJobCommandOutput.jobSummary?.jobId;

    if (!jobId) {
      throw new Error("Failed to start build");
    }

    logger.info(`Build started: ${jobId}`);

    await this.waitForBuildToComplete(appId, jobId);

    logger.info(
      "Build completed. Look at the build logs by following this link: " +
        `${GENIE_BASE_URL}/${this.stage}/app/${appId}/branch/${this.branchName}#Jobs`
    );

    logger.info(
      "Validate the app environment variables by following this link: " +
        `${GENIE_BASE_URL}/${this.stage}/app/${appId}#EnvVar`
    );
  }

  private async createApp(): Promise<CreateAppCommandOutput> {
    if (!this.repository) {
      throw new Error("Repository is required to create app");
    }

    if (!this.accessToken) {
      throw new Error("Access token is required to create app");
    }

    logger.info(`Creating app for repository: ${this.repository}...`);

    return this.amplify.createApp({
      name: "AL2023MCMTestApp",
      repository: this.repository,
      accessToken: this.accessToken,
    });
  }

  private async createBranch(appId: string) {
    logger.info(`Creating branch for app: ${appId}...`);

    return this.amplify.createBranch({
      appId,
      branchName: this.branchName,
    });
  }

  private async runBuild(appId: string) {
    logger.info(
      `Starting build for app: ${appId} and branch: ${this.branchName}...`
    );

    return this.amplify.startJob({
      appId,
      branchName: this.branchName,
      jobType: "RELEASE",
    });
  }

  private async waitForBuildToComplete(appId: string, jobId: string) {
    let jobSummary;
    let buildStatus = "IN_PROGRESS";

    while (buildStatus === "IN_PROGRESS") {
      const job = await this.amplify.getJob({
        appId,
        branchName: this.branchName,
        jobId,
      });

      jobSummary = job.job?.summary;
      buildStatus = ["SUCCEED", "FAILED"].includes(jobSummary?.status ?? "")
        ? "COMPLETE"
        : "IN_PROGRESS";

      logger.info(
        `Build status: ${buildStatus}. Waiting 5 seconds to check again...`
      );

      if (buildStatus === "IN_PROGRESS") {
        await setTimeout(5000);
      }
    }

    if (jobSummary?.status === "FAILED") {
      throw new Error(`Build failed: ${jobSummary}`);
    }

    if (jobSummary?.status === "SUCCEED") {
      logger.info(`Build succeeded: ${JSON.stringify(jobSummary)}`);
      return;
    }

    throw new Error(`Build status unknown: ${jobSummary}`);
  }
}
