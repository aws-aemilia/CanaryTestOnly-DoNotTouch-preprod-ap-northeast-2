const { execSync } = require('child_process');
const aws = require('aws-sdk');
const accountsList = require('./accounts.json').accounts;
const accounts = {};
Object.keys(accountsList).forEach((key) => accounts[accountsList[key].region] = accountsList[key].accountId);

module.exports = {
    setAWSConfig: (credRegion, sdkRegion) => {
        if (accounts[credRegion] === undefined) {
            throw new Error('Unsupported region');
        }

        const material = execSync('/apollo/bin/env -e envImprovement retrieve-material-set-credential com.amazon.credentials.isengard.' + accounts[credRegion] + '.user/ReadOnlyLogs').toString();

        const creds= new aws.Credentials();
        creds.accessKeyId = material.split('\n')[0];
        creds.secretAccessKey = material.split('\n')[1];

        aws.config.update({region: sdkRegion ? sdkRegion : credRegion, credentials: creds});
    }
};
