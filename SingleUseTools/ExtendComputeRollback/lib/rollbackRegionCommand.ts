import logger from "Commons/utils/logger";
import { DeleteRoutingRulesCommand, RollbackTargets } from "./";
import {
  BranchDAO,
  HostingConfigDAO,
  RoutingRulesDO,
  EdgeConfigDAO,
} from "Commons/dynamodb";
import confirm from "Commons/utils/confirm";

export class RollbackRegionCommand {
  private readonly branchDAO: BranchDAO;
  private readonly hostingConfigDAO: HostingConfigDAO;
  private readonly edgeConfigDAO: EdgeConfigDAO;

  public constructor(
    branchDAO: BranchDAO,
    hostingConfigDAO: HostingConfigDAO,
    edgeConfigDAO: EdgeConfigDAO
  ) {
    this.branchDAO = branchDAO;
    this.hostingConfigDAO = hostingConfigDAO;
    this.edgeConfigDAO = edgeConfigDAO;
  }

  public async execute() {
    const rollbackTargets = await new RollbackTargets(
      this.branchDAO,
      this.hostingConfigDAO,
      this.edgeConfigDAO
    ).getAll();

    if (rollbackTargets.length === 0) {
      logger.info("Nothing to rollback");
      return;
    }

    const failedRollbacks: RoutingRulesDO[] = [];
    if (!(await confirm("Are you sure you want to rollback?"))) {
      logger.info("Rollback aborted");
      return;
    }

    for (const routingRules of rollbackTargets) {
      try {
        const rollback = new DeleteRoutingRulesCommand(this.hostingConfigDAO);
        await rollback.execute(routingRules);
      } catch (err) {
        logger.error(err);
        failedRollbacks.push(routingRules);
      }
    }

    if (failedRollbacks.length > 0) {
      logger.error(failedRollbacks, "Failed rollbacks");
      throw new Error("Rollback failed for some branches");
    }
  }
}
