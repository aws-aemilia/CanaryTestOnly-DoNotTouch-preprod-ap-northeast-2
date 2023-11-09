import logger from "Commons/utils/logger";
import { RollbackTargets } from "./rollbackTargets";
import { BranchDAO, HostingConfigDAO, EdgeConfigDAO } from "Commons/dynamodb";
import { DeleteRoutingRulesCommand } from "./deleteRoutingRulesCommand";
import confirm from "Commons/utils/confirm";

export class RollbackAppCommand {
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

  public async execute(appId: string) {
    const rollbackTargets = await new RollbackTargets(
      this.branchDAO,
      this.hostingConfigDAO,
      this.edgeConfigDAO
    ).getAll(appId);

    if (rollbackTargets.length === 0) {
      logger.info("Nothing to rollback");
      return;
    }

    if (!(await confirm("Are you sure you want to rollback?"))) {
      logger.info("Rollback aborted");
      return;
    }

    for (const target of rollbackTargets) {
      const rollback = new DeleteRoutingRulesCommand(this.hostingConfigDAO);
      await rollback.execute(target);
    }
  }
}
