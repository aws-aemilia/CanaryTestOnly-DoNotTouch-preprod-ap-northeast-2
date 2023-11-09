import logger from "../../../Commons/utils/logger";
import {
  BranchDAO,
  HostingConfigDAO,
  BranchDO,
  HostingConfigRow,
  RoutingRulesDO,
  EdgeConfigDAO,
} from "Commons/dynamodb";
import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";

type BranchId = string;

export class RollbackTargets {
  private readonly branchDAO: BranchDAO;
  private readonly hostingConfigDAO: HostingConfigDAO;
  private readonly edgeConfigDAO: EdgeConfigDAO;
  private readonly branchCache: Map<BranchId, BranchDO>;
  private readonly activeJobIds: Map<string, string>;

  public constructor(
    branchDAO: BranchDAO,
    hostingConfigDAO: HostingConfigDAO,
    edgeConfigDAO: EdgeConfigDAO
  ) {
    this.branchDAO = branchDAO;
    this.hostingConfigDAO = hostingConfigDAO;
    this.edgeConfigDAO = edgeConfigDAO;
    this.branchCache = new Map<BranchId, BranchDO>();
    this.activeJobIds = new Map<string, string>();
  }

  /**
   * This is the function that finds the RoutingRules that need to be deleted.
   * If the appId is provided, it will only return the RoutingRules for that appId.
   */
  public async getAll(appId?: string): Promise<RoutingRulesDO[]> {
    const targets: RoutingRulesDO[] = [];

    logger.info("Fetching RoutingRules from HostingConfig table");
    const rows = await this.hostingConfigDAO.fullScan();
    const routingRules = rows
      .filter((rules) => this.isRoutingRules(rules))
      .filter((rules) => !appId || this.belongsToApp(rules, appId))
      .map((rules) => rules as RoutingRulesDO);

    logger.info("Found %d routing rules", routingRules.length);
    if (routingRules.length === 0) {
      return [];
    }

    logger.info("Finding the ones that belong to branches using Next.js");

    for (const rules of routingRules) {
      const branch = await this.getBranch(rules.appId, rules.branchName);

      if (!branch) {
        // Branch was likely deleted
        continue;
      }

      const activeJobId = await this.getActiveJobId(branch);

      if (!activeJobId) {
        logger.warn(branch, "ActiveJob not found for branch");
        continue;
      }

      if (
        this.isForActiveJob(activeJobId, rules) &&
        this.isUsingNextJS(branch)
      ) {
        targets.push(rules);
      }
    }

    logger.info("Found %d routing rules to rollback", targets.length);
    return targets;
  }

  private isForActiveJob(
    activeJobId: string,
    routingRules: RoutingRulesDO
  ): boolean {
    return routingRules.sk.startsWith(activeJobId);
  }

  private isUsingNextJS(branch: BranchDO): boolean {
    return (
      branch.framework !== undefined && branch.framework.startsWith("Next.js")
    );
  }

  private isRoutingRules(hostingConfigRow: HostingConfigRow) {
    return hostingConfigRow.sk.endsWith("/RoutingRules");
  }

  private belongsToApp(hostingConfigRow: HostingConfigRow, appId: string) {
    return hostingConfigRow.pk.startsWith(appId);
  }

  private async getActiveJobId(branch: BranchDO): Promise<string | undefined> {
    if (this.activeJobIds.has(branch.branchArn)) {
      return this.activeJobIds.get(branch.branchArn);
    }

    const edgeConfig =
      await this.edgeConfigDAO.getLambdaEdgeConfigForAppOrDomain(branch.appId, [
        "branchConfig",
      ]);

    if (!edgeConfig || !edgeConfig.branchConfig) {
      return undefined;
    }

    const branchConfig = edgeConfig.branchConfig[branch.displayName];
    if (!branchConfig) {
      return undefined;
    }

    this.activeJobIds.set(branch.branchArn, branchConfig.activeJobId);
    return branchConfig.activeJobId;
  }

  private async getBranch(
    appId: string,
    branchName: string
  ): Promise<BranchDO | undefined> {
    try {
      const branchId = `${appId}/${branchName}`;
      if (this.branchCache.has(branchId)) {
        return this.branchCache.get(branchId);
      }

      const branch = await this.branchDAO.getBranch({
        appId,
        branchName,
      });

      if (!branch) {
        return undefined;
      }

      this.branchCache.set(branchId, branch);
      return branch;
    } catch (err) {
      if (err instanceof ResourceNotFoundException) {
        return undefined;
      } else {
        throw err;
      }
    }
  }
}
