import { AmplifyHostingComputeClient } from "@amzn/awsamplifycomputeservice-client";
import { getAmplifyHostingComputeClient } from "Commons/ComputeService";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import { BranchDAO } from "Commons/dynamodb/tables/BranchDAO";
import { EdgeConfigDAO } from "Commons/dynamodb/tables/EdgeConfigDAO";
import {
  HostingConfigDAO,
  HostingConfigRow,
} from "Commons/dynamodb/tables/HostingConfigDAO";
import { Region, Stage } from "Commons/Isengard";
import { RegionName } from "Commons/Isengard/types";
import { createLogger } from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import pLimit from "p-limit";
import { representsActiveJob } from "./commons/representsActiveJob";
import { RollBackAHIOBranchJobCommand } from "./RollBackAHIOBranchJobCommand";

const logger = createLogger();

const ROLLBACK_CONCURRENCY = 10;

/**
 * Roll back all AHIO deployments in a region
 *
 * Finds all the active Jobs that were deployed with AHIO and rolls them back
 */
export class RollbackAHIORegionCommand {
  private readonly stage: Stage;
  private readonly region: RegionName;
  private readonly appDAOPromise: Promise<AppDAO>;
  private readonly branchDAOPromise: Promise<BranchDAO>;
  private readonly computeClientPromise: Promise<AmplifyHostingComputeClient>;
  private readonly edgeConfigDAOPromise: Promise<EdgeConfigDAO>;
  private readonly hostingConfigDAO: HostingConfigDAO;

  private readonly commandParams: {
    onlyForAccount?: string;
    onlyForApp?: string;
  };

  constructor(
    stage: Stage,
    region: Region,
    commandParams: { onlyForAccount?: string; onlyForApp?: string }
  ) {
    this.stage = stage;
    this.region = toRegionName(region);

    this.edgeConfigDAOPromise = EdgeConfigDAO.buildDefault(stage, region);
    this.hostingConfigDAO = new HostingConfigDAO(stage, region, "AHIORollback");
    this.appDAOPromise = AppDAO.buildDefault(stage, region);
    this.branchDAOPromise = BranchDAO.buildDefault(stage, region);
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
    const edgeConfigDAO = await this.edgeConfigDAOPromise;
    const amplifyHostingComputeClient = await this.computeClientPromise;
    const rollBackAHIOBranchJobCommands: RollBackAHIOBranchJobCommand[] =
      rollbackTargets.map(
        (rollbackTarget) =>
          new RollBackAHIOBranchJobCommand({
            appDAO,
            edgeConfigDAO,
            computeServiceClient: amplifyHostingComputeClient,
            hostingConfigDAO: this.hostingConfigDAO,
            region: this.region,
            stage: this.stage,
            commandParams: rollbackTarget,
          })
      );

    // Execute all rollback commands
    const limit = pLimit(ROLLBACK_CONCURRENCY);

    const results = await Promise.all(
      rollBackAHIOBranchJobCommands
        .map((command) => {
          return () => command.runWithCatch();
        })
        .map(limit)
    );

    logger.info(results);

    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    logger.info(
      `========= Successful rollbacks: ${successfulResults.length} ==========`
    );
    logger.info(JSON.stringify(successfulResults, null, 2));
    logger.info(
      `========= Failed rollbacks: ${failedResults.length} ==========`
    );
    logger.info(JSON.stringify(failedResults, null, 2));

    if (failedResults.length === 0) {
      logger.info(
        "🎉🎉 All AHIO deployments were rolled back successfully 🎉🎉"
      );
    } else {
      logger.info(
        `❌❌ ${failedResults.length} AHIO deployments failed to roll back ❌❌`
      );
      throw new Error(
        "Some AHIO deployments failed to roll back. See logs above for details"
      );
    }
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

    if (this.commandParams.onlyForApp) {
      logger.info(
        `Only rolling back for app ${this.commandParams.onlyForApp} because onlyForApp parameter was used`
      );
      targetHostingConfigRows = targetHostingConfigRows.filter(
        (row) => row.appId === this.commandParams.onlyForApp
      );

      logger.info(
        `Found ${targetHostingConfigRows.length} hosting config rows for app ${this.commandParams.onlyForApp}`
      );
    }

    const activeHostingConfigRows: HostingConfigRow[] = [];

    for (const row of targetHostingConfigRows) {
      if (
        await representsActiveJob(
          {
            edgeConfigDAO: await this.edgeConfigDAOPromise,
            branchDAO: await this.branchDAOPromise,
          },
          row
        )
      ) {
        activeHostingConfigRows.push(row);
      }
    }

    logger.info(
      `Found ${activeHostingConfigRows.length} hosting config rows for active jobs`
    );
    return activeHostingConfigRows;
  }
}
