const accountsList = require('./accounts.json').accounts;
const accounts = {};
Object.keys(accountsList)
// .filter((key) => key.indexOf('prod') >= 0)
    .forEach((key) => {
        const accountId = accountsList[key].accountId;
        const stage = accountsList[key].stage;
        const region = accountsList[key].region;
        if (!accounts[stage]) {
            accounts[stage] = {};
        }
        accounts[stage][region] = accountId;
    });

module.exports = {
    getAccountId: (stage, region) => {
        if (accounts[stage] === undefined || accounts[stage][region] === undefined) {
            throw new Error('Unsupported stage/region');
        }
        return accounts[stage][region];
    },
    getRegions: () => {
        const regions = {};
        Object.keys(accounts).forEach((stage) => {
            regions[stage] = Object.keys(accounts[stage]);
        });
        return regions;
    }
};
