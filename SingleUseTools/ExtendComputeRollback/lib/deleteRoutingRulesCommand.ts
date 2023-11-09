import logger from "Commons/utils/logger";
import { RoutingRulesDO, HostingConfigDAO } from "Commons/dynamodb";

export class DeleteRoutingRulesCommand {
  private hostingConfigDAO: HostingConfigDAO;

  public constructor(hostingConfigDAO: HostingConfigDAO) {
    this.hostingConfigDAO = hostingConfigDAO;
  }

  public async execute(routingRules: RoutingRulesDO) {
    logger.info(routingRules, "Deleting routing rules");
    await this.hostingConfigDAO.delete({
      pk: routingRules.pk,
      sk: routingRules.sk,
    });
  }
}
