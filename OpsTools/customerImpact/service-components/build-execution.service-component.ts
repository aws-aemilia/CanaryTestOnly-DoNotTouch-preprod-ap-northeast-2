import { StandardRoles, controlPlaneAccount } from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const BuildExecutionServiceComponent: ServiceComponentConfiguration = {
  /**
   * Customers with builds that fail due to service faults
   */
  [MetricType.Faults]: [
    {
      accountLookupFn: controlPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: [
        "/aws/lambda/AemiliaWebhookProcessorLambda-PostJobHandler",
      ],
      queryString: `
        filter isFault="true" and stepName="BUILD" and buildPhase="BuildExecution" 
        | stats count(*) by accountId 
        | display accountId
        | limit 10000
      `,
      outputType: "accountId",
    },
  ],
};

export { BuildExecutionServiceComponent };
