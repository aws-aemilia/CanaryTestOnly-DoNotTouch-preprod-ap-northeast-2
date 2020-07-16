/* eslint-disable */
import AWS from 'aws-sdk';
/* eslint-enable */
import tokenRetriever from './tokenRetriever';

const MIDWAY_HOSTNAME = 'midway-auth.amazon.com';
const FIFTEEN_MINUTES_IN_MILLISECONDS = 1000 * 60 * 15;

export default class MidwayIdentityCredentialProvider extends AWS.CognitoIdentityCredentials {
    constructor(configuration) {
        validateConfiguration(configuration);

        // If this client is responsible for initial midway login,
        // these parameters will need to be cleaned up after redirect
        deleteQueryParameter('id_token');
        deleteQueryParameter('state');

        const {region} = configuration;
        const identityPoolId = configuration.cognitoIdentityPoolId;

        const awsSdkConfiguration = {region};
        const cognitoConfiguration = {
            IdentityPoolId: identityPoolId,
            Logins: {},
        };

        super(cognitoConfiguration, awsSdkConfiguration);
        this.region = region;
        // This is used to dedupe refreshing the midway token multiple times asynchronously
        this.refreshTokenDeduper = null;
        // similar as above but for deduping the actual cognito credentials
        this.refreshCredentialsDeduper = null;

        // Refresh to force Midway login if necessary before first call
        this.refresh(() => {
        });
    }

    refresh(callback) {
        this.refreshToken()
            .then(() => {
                // If we already have a refresh going on, let's just wait for that promise
                this.refreshCredentialsDeduper = this.refreshCredentialsDeduper ||
                    // else create a new promise that is called back once super.refresh finishes
                    new Promise((resolve) => {
                        super.refresh(() => {
                            // credentials request is done, so let's reset
                            this.refreshCredentialsDeduper = null;
                            resolve();
                        });
                    });
                // once the promise finishes, then kick off the caller's callback
                this.refreshCredentialsDeduper.then(callback);
            });
    }

    needsRefresh() {
        return !this.params.Logins[MIDWAY_HOSTNAME] ||
            Date.now() > this.idTokenExpireTime ||
            super.needsRefresh();
    }

    refreshToken() {
        // if we already have a new refreshToken going on, dedupe to only have 1 midway request
        this.refreshTokenDeduper = this.refreshTokenDeduper ||
            tokenRetriever.getTokenOrRedirect()
                .then((token) => {
                    this.params.Logins[MIDWAY_HOSTNAME] = token;
                    this.idTokenExpireTime = Date.now() + FIFTEEN_MINUTES_IN_MILLISECONDS;
                })
                .finally(() => {
                    // token has been retrieved, so reset
                    this.refreshTokenDeduper = null;
                });
        return this.refreshTokenDeduper;
    }
}

function validateConfiguration(config) {
    if (typeof config !== 'object') {
        throw new Error('Missing config for MidwayIdentityCredentialProvider');
    }
    if (!config.cognitoIdentityPoolId) {
        throw new Error('Missing cognitoIdentityPoolId in config for MidwayIdentityCredentialProvider');
    }
    if (!config.region) {
        throw new Error('Missing region in config for MidwayIdentityCredentialProvider');
    }
}

function deleteQueryParameter(key) {
    const queryParams = new URLSearchParams(window.location.search);
    if (!queryParams.get(key)) {
        return;
    }
    queryParams.delete(key);
    const newUrl = new URL(window.location.href);
    newUrl.search = queryParams;
    window.history.replaceState({}, '', newUrl);
}
