export interface Branch {
    appId: string;
    branchName: string;
    config?: BranchConfig;
}

export interface LambdaEdgeConfig {
    appId: string;
    config?: Map<string, string>;
    branchConfig?: {
        [branchName: string]: Map<string, string>;
    };
    customDomainIds?: Set<string>;
    customRuleConfigs?: Set<CustomRuleConfigs>;
    hostNameConfig?: {
        [domainName: string]: HostNameConfigs;
    };
    originKey: string;
    updateTime: string;
}

export interface HostNameConfigs {
    targetBranch?: string;
}

export interface BranchConfig {
    basicAuthCredsV2?: string;
    basicAuthCreds?: string;
    ssrDistributionId?: string;
}

export interface DomainItem {
    "appId": string,
    "domainName": string,
    "domainId": string,
}

export interface BranchItem {
    "branchName": string,
    "displayName": string,
}

export interface InvalidApps {
    "appId": string,
    "customDomainId": string,
    "branch": string,
    "updateTime": string | undefined,
}

export interface CustomRuleConfigs {
    "source": string,
    "status": string,
    "target": string,
}

export interface AmplifyIssueTimeLine {
    "region": string,
    "cutoffTime": string
}