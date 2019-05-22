import axios from 'axios';
import axiosRetry from 'axios-retry';

import MidwayIdentityCredentialProvider from './credentials';
import signRequest from './signRequest';

const REGION_KEY = 'region';
const HTTP_ENDPOINT_KEY = 'httpEndpoint';
const COGNITO_IDENITITY_POOL_ID_KEY = 'cognitoIdentityPoolId';
const REQUIRED_CONFIGURATION_KEYS = [HTTP_ENDPOINT_KEY, COGNITO_IDENITITY_POOL_ID_KEY, REGION_KEY];
const CLIENT_RETRY_COUNT = 2;

export default class MidwayIdentityJavaScriptClient {
    constructor(configuration) {
        validateConfiguration(configuration, REQUIRED_CONFIGURATION_KEYS);

        const httpClient = axios.create({ baseURL: configuration.httpEndpoint });
        const credentials = new MidwayIdentityCredentialProvider({
            region: configuration.region,
            cognitoIdentityPoolId: configuration.cognitoIdentityPoolId,
        });
        const service = configuration.service || 'execute-api';

        httpClient.interceptors.request.use(request => signRequest(request, credentials, service));
        httpClient.credentials = credentials;
        axiosRetry(httpClient, { retries: CLIENT_RETRY_COUNT });
        return Object.assign(this, httpClient);
    }
}

function validateConfiguration(configuration, requiredKeys) {
    const errorMessage = `Failed to validate client configuration. ${JSON.stringify(configuration)} must be an object containing ${requiredKeys}`;
    if (typeof configuration !== 'object') { throw new Error(errorMessage); }

    requiredKeys.forEach((key) => {
        if (configuration[key] === undefined) {
            throw new Error(errorMessage);
        }
    });
}
