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
    customDomainIds: Set<string>;
    hostNameConfig?: {
        [domainName: string]: HostNameConfigs;
    }
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
}