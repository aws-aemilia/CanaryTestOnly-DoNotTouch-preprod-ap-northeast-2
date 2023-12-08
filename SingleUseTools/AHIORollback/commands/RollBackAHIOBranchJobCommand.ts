import {
  AmplifyHostingComputeClient,
  DeploymentSummary,
  GetDeploymentCommand,
  StartDeploymentCommand,
} from "@amzn/awsamplifycomputeservice-client";
import { getAmplifyHostingComputeClient } from "Commons/ComputeService";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import { BranchDAO } from "Commons/dynamodb/tables/BranchDAO";
import { EdgeConfigDAO } from "Commons/dynamodb/tables/EdgeConfigDAO";
import { HostingConfigDAO } from "Commons/dynamodb/tables/HostingConfigDAO";
import { Stage } from "Commons/Isengard";
import { RegionName } from "Commons/Isengard/types";
import { createLogger } from "Commons/utils/logger";
import sleep from "Commons/utils/sleep";
import { representsActiveJob } from "./commons/representsActiveJob";

const logger = createLogger();

/**
 * Rollback AHIO for a given Job by doing a compute deployment with the backup bundle
 * This command is idempotent
 */
export class RollBackAHIOBranchJobCommand {
  private readonly stage: Stage;
  private readonly region: RegionName;

  private readonly appDAO: AppDAO;
  private readonly edgeConfigDAO: EdgeConfigDAO;
  private readonly branchDAOPromise: Promise<BranchDAO>;
  private readonly computeServiceClient: AmplifyHostingComputeClient;
  private readonly hostingConfigDAO: HostingConfigDAO;

  private readonly commandParams: RollBackAHIOBranchJobCommandParams;

  constructor(params: {
    stage: Stage;
    region: RegionName;
    appDAO: AppDAO;
    edgeConfigDAO: EdgeConfigDAO;
    computeServiceClient: AmplifyHostingComputeClient;
    hostingConfigDAO: HostingConfigDAO;
    commandParams: RollBackAHIOBranchJobCommandParams;
  }) {
    this.stage = params.stage;
    this.region = params.region;
    this.appDAO = params.appDAO;
    this.edgeConfigDAO = params.edgeConfigDAO;
    this.computeServiceClient = params.computeServiceClient;
    this.hostingConfigDAO = params.hostingConfigDAO;
    this.commandParams = params.commandParams;
    this.branchDAOPromise = BranchDAO.buildDefault(this.stage, this.region);
  }

  public static async build(
    stage: Stage,
    region: RegionName,
    commandParams: RollBackAHIOBranchJobCommandParams
  ): Promise<RollBackAHIOBranchJobCommand> {
    return new RollBackAHIOBranchJobCommand({
      appDAO: await AppDAO.buildDefault(stage, region),
      edgeConfigDAO: await EdgeConfigDAO.buildDefault(stage, region),
      computeServiceClient: await getAmplifyHostingComputeClient(stage, region),
      hostingConfigDAO: new HostingConfigDAO(stage, region, "OncallOperator"),
      region,
      stage,
      commandParams,
    });
  }

  public async runWithCatch() {
    try {
      await this.run();
      return { success: true, params: this.commandParams };
    } catch (e) {
      logger.error(e);
      return {
        success: false,
        params: this.commandParams,
        error: `${(e as Error).name}: ${(e as Error).message}`,
      };
    }
  }

  public async run(): Promise<void> {
    logger.info(`Rolling back AHIO for ${JSON.stringify(this.commandParams)}`);

    // Check if the active job is still active
    if (
      !(await representsActiveJob(
        {
          edgeConfigDAO: this.edgeConfigDAO,
          branchDAO: await this.branchDAOPromise,
        },
        this.commandParams
      ))
    ) {
      logger.info(
        `${this.commandParams.appId}/${this.commandParams.branchName} job ${this.commandParams.activeJobId} is not the active job. Skipping rollback`
      );
      return;
    }

    const appDO = await this.appDAO.getAppById(this.commandParams.appId);

    // Do a compute deployment with the backup bundle
    const startDeploymentCommandOutput = await this.computeServiceClient.send(
      new StartDeploymentCommand({
        accountId: appDO.accountId,
        appId: appDO.appId,
        branchName: this.commandParams.branchName,
        customerRoleArn: appDO.iamServiceRoleArn, // may be undefined. That's ok
        deploymentArtifact: this.getBackupBundle(),
        deploymentId: `ROLLBACK-AHIO-${this.commandParams.activeJobId}`, // adding the job id to ensure a single rollback per job (appId,branchName are already in stackId)
        stackId: `arn:aws:amplify:${this.region}:${appDO.accountId}:apps/${appDO.appId}/branches/${this.commandParams.branchName}`,
      })
    );

    // Wait for deployment to finish successfully
    logger.info(
      `Compute Deployment started ${JSON.stringify(
        startDeploymentCommandOutput.deployment
      )}`
    );

    logger.info(
      `Waiting for compute deployment ${startDeploymentCommandOutput.deployment?.stackId} to finish`
    );
    const finalDeploymentSummary = await this.waitUntilDeploymentIsComplete(
      startDeploymentCommandOutput.deployment!
    );

    if (finalDeploymentSummary.status === "FAILED") {
      throw new Error(
        `Compute deployment failed: ${JSON.stringify(finalDeploymentSummary)}`
      );
    }

    logger.info(
      `Compute deployment finished successfully: ${JSON.stringify(
        finalDeploymentSummary
      )}`
    );

    // Delete the ImageSettings HostingConfig item
    const key = {
      pk: `${appDO.appId}/${this.commandParams.branchName}`,
      sk: `${this.commandParams.activeJobId}/ImageSettings`,
    };

    logger.info(`Deleting HostingConfig ${JSON.stringify(key)}`);
    await this.hostingConfigDAO.delete(key);

    logger.info(
      `Successfully rolled back ${JSON.stringify(this.commandParams)}`
    );
  }
  private async waitUntilDeploymentIsComplete(
    deploymentSummary: DeploymentSummary
  ): Promise<DeploymentSummary> {
    let latestDeploymentSummary: DeploymentSummary = deploymentSummary;

    while (!["SUCCEEDED", "FAILED"].includes(latestDeploymentSummary.status!)) {
      await sleep(10_000);
      const getDeploymentCommandOutput = await this.computeServiceClient.send(
        new GetDeploymentCommand({
          deploymentId: deploymentSummary.deploymentId,
          stackId: deploymentSummary.stackId,
        })
      );

      latestDeploymentSummary = getDeploymentCommandOutput.deployment!;

      logger.info(
        `Deployment ${deploymentSummary.stackId},${deploymentSummary.deploymentId} is ${latestDeploymentSummary.status}`
      );
    }

    return latestDeploymentSummary;
  }

  private getBackupBundle(): { s3Key: string; s3Bucket: string } {
    const { appId, branchName, activeJobId } = this.commandParams;
    return {
      s3Bucket: `aws-amplify-${this.stage}-${this.region}-artifacts`,
      s3Key: `${appId}/${branchName}/${activeJobId}/BUILD/backup-bundle.zip`,
    };
  }
}

export type RollBackAHIOBranchJobCommandParams = {
  accountId: string;
  activeJobId: string;
  appId: string;
  branchName: string;
};
