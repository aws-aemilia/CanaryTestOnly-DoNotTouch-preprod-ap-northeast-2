import {
  StandardRoles,
  kinesisConsumerAccount,
} from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const HostingServiceComponent: ServiceComponentConfiguration = {
  [MetricType.Faults]: [
    {
      accountLookupFn: kinesisConsumerAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: [
        "/aws/fargate/AmplifyHostingKinesisConsumer-Prod/application.log",
      ],
      queryString: `
        filter \`sc-status\` > 499
        | stats count(*) by accountId
        | display accountId
        | limit 10000
      `,
      outputType: "accountId",
    },
  ],
};

export { HostingServiceComponent };
