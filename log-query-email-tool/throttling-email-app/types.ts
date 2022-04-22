export type TableRow = {
    customerAccountId: string;
    region: string;
    service: string;
    numberOfThrottles: string;
};

export type AmplifyService = {
    serviceName: string,
    logGroup: string,
    linkToQuery: string,
    throttlingQuery: string
}

export type AmplifyServiceQueryResults = {
    service: AmplifyService,
    queryId?: string,
    queryResponse?: TableRow[]
}