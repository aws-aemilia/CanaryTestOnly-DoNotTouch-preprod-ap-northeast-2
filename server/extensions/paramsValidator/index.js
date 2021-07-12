const { getAccountId } = require('../accounts');
 
module.exports = {
    isParamsValid: (stage, region, appId) => {
        // Validate AppId
        if (appId === null || appId.trim() === '') return false;
    
        // Validate Stage, Region
        try {
            const accountId = getAccountId(stage, region)
        } catch (e){
            return false;
        }
        return true;
    }
}