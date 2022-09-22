export interface App {
  appId: string;
  autoBranchCreationConfig?: AutoBranchCreationConfig;
  basicAuthCreds?: string;
  basicAuthCredsV2?: string;
  platform?: string;
  accountId?: string;
}

export interface Branch {
  appId: string;
  branchName: string;
  config?: BranchConfig;
}

export interface LambdaEdgeConfig {
  appId: string;
  config?: {
    basicAuthCreds?: string;
    basicAuthCredsV2?: string;
  };
  branchConfig?: {
    [branchName: string]: BranchConfig;
  };
  customDomainIds : Set<string>;
  hostNameConfig?: {
    [domainName: string]: HostNameConfigs;
  }
}

export interface AutoBranchCreationConfig {
  stage: string;
  branchConfig?: BranchConfig;
}

export interface HostNameConfigs {
  targetBranch?: string;
}

export interface BranchConfig {
  basicAuthCredsV2?: string;
  basicAuthCreds?: string;
  ssrDistributionId?: string;
}

export interface DynamoDBAttributeName {
  attributeName: string;
  ExpressionAttributeNames: {
    [key: string]: string;
  };
}
