import { Region, Stage } from "Commons/Isengard";
import { RegionName } from "Commons/Isengard/types";
import { EdgeConfigDAO } from "Commons/dynamodb/tables/EdgeConfigDAO";
import {
  HostingConfigDAO,
  HostingConfigRow,
} from "Commons/dynamodb/tables/HostingConfigDAO";
import { createLogger } from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import { RollBackAHIOBranchJobCommand } from "./RollBackAHIOBranchJobCommand";
import { getAmplifyHostingComputeClient } from "Commons/ComputeService";
import { AmplifyHostingComputeClient } from "@amzn/awsamplifycomputeservice-client";

const logger = createLogger();

/**
 * Roll back all AHIO deployments in a region
 *
 * Finds all the active Jobs that were deployed with AHIO and rolls them back
 */
export class RollbackAHIORegionCommand {
  private readonly stage: Stage;
  private readonly region: RegionName;
  private readonly appDAOPromise: Promise<AppDAO>;
  private readonly computeClientPromise: Promise<AmplifyHostingComputeClient>;
  private readonly edgeConfigDAO: EdgeConfigDAO;
  private readonly hostingConfigDAO: HostingConfigDAO;

  private readonly commandParams: { onlyForAccount?: string };

  constructor(
    stage: Stage,
    region: Region,
    commandParams: { onlyForAccount?: string }
  ) {
    this.stage = stage;
    this.region = toRegionName(region);
    this.edgeConfigDAO = new EdgeConfigDAO(stage, region);
    this.hostingConfigDAO = new HostingConfigDAO(stage, region, "AHIORollback");
    this.appDAOPromise = AppDAO.buildDefault(stage, region);
    this.computeClientPromise = getAmplifyHostingComputeClient(
      this.stage,
      this.region
    );
    this.commandParams = commandParams;
  }

  public async run() {
    // Gather all the AHIO deployments that need to be rolled back
    const rollbackTargets = await this.getRollbackTargets();
    logger.info(
      `Found ${rollbackTargets.length} AHIO deployments to rollback:`
    );
    logger.info(rollbackTargets.map((r) => `${r.pk} ${r.sk}`));

    // Prepare the rollback commands
    const appDAO = await this.appDAOPromise;
    const amplifyHostingComputeClient = await this.computeClientPromise;
    const rollBackAHIOBranchJobCommands: RollBackAHIOBranchJobCommand[] =
      rollbackTargets.map(
        (rollbackTarget) =>
          new RollBackAHIOBranchJobCommand({
            appDAO,
            computeServiceClient: amplifyHostingComputeClient,
            hostingConfigDAO: this.hostingConfigDAO,
            region: this.region,
            stage: this.stage,
            commandParams: rollbackTarget,
          })
      );

    // Execute all rollback commands
    for (const command of rollBackAHIOBranchJobCommands) {
      // commands could run in parallel, but it's simpler to run them sequentially
      await command.run();
    }

    logger.info("🎉🎉 All AHIO deployments were rolled back successfully 🎉🎉");
  }

  private async getRollbackTargets(): Promise<HostingConfigRow[]> {
    let targetHostingConfigRows = (
      await this.hostingConfigDAO.fullScan()
    ).filter((r) => r.sk.endsWith("ImageSettings")); // At the moment of writing this tool, prod only has ImageSettings, but gamma already has RoutingRules

    logger.info(`Found ${targetHostingConfigRows.length} hosting config rows`);

    if (this.commandParams.onlyForAccount) {
      logger.info(
        `Only rolling back for account ${this.commandParams.onlyForAccount} because onlyForAccount parameter was used`
      );
      targetHostingConfigRows = targetHostingConfigRows.filter(
        (row) => row.accountId === this.commandParams.onlyForAccount
      );

      logger.info(
        `Found ${targetHostingConfigRows.length} hosting config rows for account ${this.commandParams.onlyForAccount}`
      );
    }

    const activeHostingConfigRows: HostingConfigRow[] = [];

    for (const row of targetHostingConfigRows) {
      if (await this.representsActiveJob(row)) {
        activeHostingConfigRows.push(row);
      }
    }

    logger.info(
      `Found ${activeHostingConfigRows.length} hosting config rows for active jobs`
    );
    return activeHostingConfigRows;
  }

  private async representsActiveJob(
    hostingConfigRow: HostingConfigRow
  ): Promise<boolean> {
    const edgeConfig =
      await this.edgeConfigDAO.getLambdaEdgeConfigForAppOrDomain(
        hostingConfigRow.appId
      );

    if (!edgeConfig) {
      logger.info(
        `No EdgeConfig found for app ${hostingConfigRow.appId}. Most likely it was deleted. Skipping...`
      );
      return false;
    }

    if (
      edgeConfig.branchConfig?.[hostingConfigRow.branchName]?.activeJobId !==
      hostingConfigRow.activeJobId
    ) {
      logger.info(
        `HostingConfig ${hostingConfigRow.pk} ${
          hostingConfigRow.activeJobId
        } does not match the active Job. activeJob in EdgeConfig is ${
          edgeConfig.branchConfig?.[hostingConfigRow.branchName]?.activeJobId
        }. Skipping...`
      );
      return false;
    } else {
      return true;
    }
  }
}
