import {
  BuildExecutionServiceComponent,
  BuildTriggerServiceComponent,
  ControlPlaneServiceComponent,
  DeploymentServiceComponent,
  HostingGatewayServiceComponent,
  HostingServiceComponent,
  MetricType,
  ServiceComponent,
  ServiceComponentConfiguration,
  ServiceComponentQueryContext,
} from "./service-components";

const configurationMap: {
  [key in ServiceComponent]?: ServiceComponentConfiguration;
} = {
  [ServiceComponent.ControlPlane]: ControlPlaneServiceComponent,
  [ServiceComponent.BuildTrigger]: BuildTriggerServiceComponent,
  [ServiceComponent.BuildExecution]: BuildExecutionServiceComponent,
  [ServiceComponent.Deployment]: DeploymentServiceComponent,
  [ServiceComponent.Hosting]: HostingServiceComponent,
  [ServiceComponent.HostingGateway]: HostingGatewayServiceComponent,
};

export const getServiceComponentQueries = (
  serviceComponent: ServiceComponent,
  metricType: MetricType
): ServiceComponentQueryContext[] => {
  return configurationMap[serviceComponent]?.[metricType] ?? [];
};
