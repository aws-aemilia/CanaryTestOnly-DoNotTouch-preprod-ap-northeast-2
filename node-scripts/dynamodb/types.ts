export interface LambdaEdgeConfig {
  appId: string;
  customDomainIds: Set<string>;
  customRuleConfigs?: CustomRuleConfig[];
  updateTime: string;
  createTime: string;
  branchConfig?: {
    [branchName: string]: BranchConfig;
  };
}

export interface BranchConfig {
  activeJobId: string;
  branchName: string;
  customHeaders: string;
  enableBasicAuth: string;
  performanceMode: string;
}

export interface CustomRuleConfig {
  target: string;
  source: string;
  status: string;
  condition?: string;
}

export interface DynamoDBAttributeName {
  attributeName: string;
  ExpressionAttributeNames: {
    [key: string]: string;
  };
}

export interface AppDO {
  defaultDomain: string;
  cloudFrontDistributionId: string;
  autoBranchCreationPatterns: string[];
  enableAutoBranchDeletion: number;
  name: string;
  enableCustomHeadersV2: number;
  repository: string;
  version: number;
  iamServiceRoleArn: string;
  accountId: string;
  accountClosureStatus?: string;
  enableBranchAutoBuild: number;
  certificateArn: string;
  createTime: string;
  hostingBucketName: string;
  buildSpec: string;
  cloneUrl: string;
  enableRewriteAndRedirect: number;
  platform: "WEB" | "WEB_DYNAMIC" | "WEB_COMPUTE";
  updateTime: string;
  appId: string;
  enableAutoBranchCreation: number;
  enableBasicAuth: number;
  environmentVariables: {
    [key: string]: string;
  };
}

export interface DomainDO {
  appId: string;
  domainName: string;
  enableAutoSubDomain: number;
  certificateVerificationRecord: string;
  status: string;
  distributionId: string;
  createTime: string;
  subDomainDOs: SubdomainDO[];
  updateTime: string;
  domainId: string;
  domainType: string;
  version: number;
}

export interface SubdomainDO {
  domainRecord: string;
  verified: number;
  branch: string;
}
