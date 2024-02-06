/**
 * Limit definitions taken form the Minerva package
 * https://code.amazon.com/packages/AWSMinervaLimitDefinitionConfig/blobs/ab0ac2aeef080e5e48dc669660f2c03a1d024641/--/templates/limits/AwsAmplify/limits.auto.json.erb
 */

import { keyBy } from "lodash";
export interface MinervaLimit {
  name: string;
  defaultLimit: number;
  isAdjustable: boolean;
  displayName: string;
  description: string;
  hardLimit?: number;
  contextScope?: string;
  contextScopeType?: string;
}

export interface AdjustableMinervaLimit extends MinervaLimit {
  hardLimit: number;
  isAdjustable: true;
}

const adjustableLimits: AdjustableMinervaLimit[] = [
  {
    name: "CUSTOMER_APP_PER_REGION_COUNT",
    defaultLimit: 25,
    hardLimit: 10_000, // extraordinarily high limit since we effectively do not want a hard limit
    isAdjustable: true,
    displayName: "Apps",
    description:
      "The maximum number of apps that you can create in AWS Amplify Console in this account in the current Region.",
  },
  {
    name: "WEBHOOKS_PER_APP_COUNT",
    defaultLimit: 50,
    hardLimit: 150,
    isAdjustable: true,
    displayName: "Webhooks per app",
    description:
      "The maximum number of webhooks per app that you can create in this account in the current Region.",
  },
  {
    name: "DOMAINS_PER_APP_COUNT",
    defaultLimit: 5,
    hardLimit: 40,
    isAdjustable: true,
    displayName: "Domains per app",
    description:
      "The maximum number of domains per app that you can create in this account in the current Region.",
  },
  {
    name: "CONCURRENT_JOBS_COUNT",
    defaultLimit: 5,
    hardLimit: 15,
    isAdjustable: true,
    displayName: "Concurrent jobs",
    description:
      "The maximum number of concurrent jobs that you can create in this account in the current Region.",
  },
  {
    name: "REQUEST_TOKENS_PER_SECOND",
    contextScope: "AWS::Amplify::App",
    contextScopeType: "RESOURCE",
    defaultLimit: 10_000,
    hardLimit: 20_000,
    isAdjustable: true,
    displayName: "Hosting request tokens refill rate",
    description: "The refill rate of request tokens per second for the app.",
  },
  {
    name: "REQUEST_TOKENS_BURST_QUOTA",
    contextScope: "AWS::Amplify::App",
    contextScopeType: "RESOURCE",
    defaultLimit: 10_000,
    hardLimit: 20_000,
    isAdjustable: true,
    displayName: "Hosting request tokens bucket size",
    description:
      "The maximum number of additional tokens per second (RPS) that the app can consumed in one burst.",
  },
];

const nonAdjustableLimits: MinervaLimit[] = [
  {
    name: "MAXIMUM_APP_CREATIONS_PER_HOUR",
    defaultLimit: 25,
    isAdjustable: false,
    displayName: "Maximum app creations per hour",
    description:
      "The maximum number of apps that you can create in AWS Amplify Console per hour in this account in the current Region.",
  },
  {
    name: "BRANCHES_PER_APP_COUNT",
    defaultLimit: 50,
    isAdjustable: false,
    displayName: "Branches per app",
    description:
      "The maximum number of branches per app that you can create in this account in the current Region.",
  },
  {
    name: "SUB_DOMAINS_PER_DOMAIN_COUNT",
    defaultLimit: 50,
    isAdjustable: false,
    displayName: "Subdomains per domain",
    description:
      "The maximum number of subdomains per domain that you can create in this account in the current Region.",
  },
  {
    name: "BUILD_ARTIFACT_MAX_SIZE",
    defaultLimit: 5,
    isAdjustable: false,
    displayName: "Build artifact size",
    description:
      "The maximum size (in GB) of an app build artifact. A build artifact is deployed by AWS Amplify Console after a build.",
  },
  {
    name: "MANUAL_DEPLOY_ARTIFACT_MAX_SIZE",
    defaultLimit: 5,
    isAdjustable: false,
    displayName: "Manual deploy ZIP file size",
    description: "The maximum size (in GB) of a manual deploy ZIP file.",
  },
  {
    name: "CACHE_ARTIFACT_MAX_SIZE",
    defaultLimit: 5,
    isAdjustable: false,
    displayName: "Cache artifact size",
    description: "The maximum size (in GB) of a cache artifact.",
  },
  {
    name: "ENVIRONMENT_CACHE_ARTIFACT_MAX_SIZE",
    defaultLimit: 5,
    isAdjustable: false,
    displayName: "Environment cache artifact size",
    description: "The maximum size (in GB) of the environment cache artifact.",
  },
];

const allLimits: MinervaLimit[] = [...adjustableLimits, ...nonAdjustableLimits];
export const allLimitsByName = keyBy(allLimits, "name");
export const allLimitNames = allLimits.map((l) => l.name);
export const adjustableLimitsNames = adjustableLimits.map((l) => l.name);
export const arroyoBasedLimits = [
  "REQUEST_TOKENS_PER_SECOND",
  "REQUEST_TOKENS_BURST_QUOTA",
];
