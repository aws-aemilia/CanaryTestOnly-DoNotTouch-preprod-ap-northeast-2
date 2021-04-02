const accountsList = require("./accounts.json").accounts;

module.exports = {
    getRegion: (account) => {
        let region;
        Object.keys(accountsList).forEach((key) => {
            const accountId = accountsList[key].accountId;
            if (accountId == account) {
                region = accountsList[key].alias;
            }
        });
        return region
    }
};
