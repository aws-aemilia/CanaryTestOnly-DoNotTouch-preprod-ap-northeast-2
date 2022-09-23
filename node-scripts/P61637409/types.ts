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
}

export interface AutoBranchCreationConfig {
  stage: string;
  branchConfig?: BranchConfig;
}

export interface BranchConfig {
  basicAuthCredsV2?: string;
  basicAuthCreds?: string;
}

export interface DynamoDBAttributeName {
  attributeName: string;
  ExpressionAttributeNames: {
    [key: string]: string;
  };
}
