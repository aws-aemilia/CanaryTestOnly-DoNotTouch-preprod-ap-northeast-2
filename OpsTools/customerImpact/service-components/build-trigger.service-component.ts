import { StandardRoles, controlPlaneAccount } from "../../../Commons/Isengard";
import { MetricType, ServiceComponentConfiguration } from "./types";

const BuildTriggerServiceComponent: ServiceComponentConfiguration = {
  [MetricType.Faults]: [
    {
      accountLookupFn: controlPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: [
        "/aws/lambda/AemiliaWebhookProcessorLamb-IncomingWebhookHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-CodeCommitHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-PostJobHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-WebHookHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-WebPreviewHandler",
        "/aws/lambda/TriggerBuild",
      ],
      queryString: `
        filter isFault="true" and stepName="BUILD" and buildPhase="BuildTrigger"
        | stats count(*) by accountId
        | display accountId
        | limit 10000
      `,
      outputType: "accountId",
    },
    {
      accountLookupFn: controlPlaneAccount,
      role: StandardRoles.ReadOnly,
      logGroupPrefixes: [
        "/aws/lambda/AemiliaWebhookProcessorLamb-IncomingWebhookHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-CodeCommitHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-WebHookHandler",
        "/aws/lambda/AemiliaWebhookProcessorLambda-WebPreviewHandler",
        "/aws/lambda/AemiliaWebhookProcessorLam-GitHubValidationHandler",
        "/aws/lambda/TriggerBuild",
      ],
      queryString: `
        filter fault=1
        | stats count(*) by appId
        | display appId
      `,
      outputType: "appId",
    },
  ],
};

export { BuildTriggerServiceComponent };
