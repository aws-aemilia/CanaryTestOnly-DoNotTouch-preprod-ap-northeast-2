import { Region, Stage } from "../../../Commons/Isengard/types";
import { AmplifyAccount, StandardRoles } from "../../../Commons/Isengard";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export enum ServiceComponent {
  ControlPlane = "control-plane",
  BuildTrigger = "build-trigger",
  BuildExecution = "build-execution",
  Deployment = "deployment",
  Hosting = "hosting",
  HostingGateway = "hosting-gateway",
}

export enum MetricType {
  /**
   * Number of customers who experienced 5xx errors or failures due to service faults
   */
  Faults = "faults",
  /**
   * Number of customers who experienced errors
   */
  Errors = "errors",
  /**
   * Number of customers who experienced high latency requests
   */
  Latency = "latency",
  /**
   * Number of customers with any activity during impact period
   */
  Count = "count",
}

export interface ServiceComponentQueryContext {
  /**
   * The account lookup function to run to get the account to run the query against.
   */
  accountLookupFn: (stage: Stage, region: Region) => Promise<AmplifyAccount>;
  /**
   * The role to assume when running the query.
   */
  role: StandardRoles;
  /**
   * The log group prefixes to run the query against.
   * @example ["AmplifyControlPlaneAPIAccessLogs"]
   */
  logGroupPrefixes: string[];
  /**
   * The query to run
   * @example
   * ```
   * filter response.statusCode >= 500 and identity.userAgent not like /Vert.x-WebClient/
   * | stats count(*) as @count by identity.accountId
   * | display identity.accountId
   * ```
   * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html
   */
  queryString: string;
  outputType: "appId" | "accountId";
}

export type ServiceComponentConfiguration = {
  [key in MetricType]?: ServiceComponentQueryContext[];
};
