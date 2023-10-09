import { StandardRoles, controlPlaneAccount } from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const ControlPlaneServiceComponent: ServiceComponentConfiguration = {
  [MetricType.Faults]: [
    {
      accountLookupFn: controlPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: ["AmplifyControlPlaneAPIAccessLogs"],
      queryString: `
        fields identity.accountId as accountId
        | filter response.statusCode >= 500 and identity.userAgent not like /Vert.x-WebClient/
        | stats count(*) by accountId
        | display accountId
        | limit 10000
      `,
      outputType: "accountId",
    },
  ],
};

export { ControlPlaneServiceComponent };
