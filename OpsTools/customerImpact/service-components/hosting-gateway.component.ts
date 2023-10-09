import { StandardRoles, dataPlaneAccount } from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const HostingGatewayServiceComponent: ServiceComponentConfiguration = {
  [MetricType.Faults]: [
    {
      accountLookupFn: dataPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: ["HostingGateway/ApplicationLogs/prod"],
      queryString: `
        filter level="error" and fault=1
        | stats count(*) by AppId as appId
        | display appId
        | limit 10000
      `,
      outputType: "appId",
    },
  ],
};

export { HostingGatewayServiceComponent };
