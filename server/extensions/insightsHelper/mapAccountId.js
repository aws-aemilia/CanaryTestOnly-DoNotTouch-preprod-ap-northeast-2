module.exports = mapAppIdToAccountId = (data) => {
    // Refine result for key: accountId, value: array of appId
    let accountIdMap = new Map();
    let accountRegionMap = new Map();
    for (let OneRegionAccounts of data) {
        let region = OneRegionAccounts.region
        for (let id of OneRegionAccounts.id) {
            if (id === null) continue;
            let accountId = id.accountId;
            let appId = id.appId;
            if (accountIdMap.has(accountId)) {
                accountIdMap.get(accountId).push(appId);
                accountRegionMap.get(accountId).add(region);
            } else {
                accountIdMap.set(accountId, [appId]);
                accountRegionMap.set(accountId, new Set([region]));
            }
        }
    }
    // Convert to array of objects
    let accounts = [];
    for (let key of accountIdMap.keys()) {
        let obj = {
            accountId: key,
            appId: accountIdMap.get(key),
            regions: Array.from(accountRegionMap.get(key))
        };
        accounts.push(obj);
    }
    return accounts;
};
