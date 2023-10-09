import { StandardRoles, controlPlaneAccount } from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const DeploymentServiceComponent: ServiceComponentConfiguration = {
  [MetricType.Faults]: [
    {
      accountLookupFn: controlPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: ["AmplifyDeploymentService-ECSSERVICE"],
      queryString: `
        fields @timestamp, @message
        | filter strcontains(@message,"Fatal error")
        | parse @message "*|*|*|*:  *" as accountId, appId, branch, job
        | stats count(*) by accountId
        | display accountId
        | limit 10000
      `,
      outputType: "accountId",
    },
  ],
};

export { DeploymentServiceComponent };
