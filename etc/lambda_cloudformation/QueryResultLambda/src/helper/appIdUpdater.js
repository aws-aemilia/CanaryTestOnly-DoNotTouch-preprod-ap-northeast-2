module.exports = appIdUpdater = (DomainDDBQueryResults, domainIds) => { 
    // Update some appId after querying DDB Domain table
    for (let item of DomainDDBQueryResults){
        if (item.Items.length != 0){
            domainIds.delete(item.Items[0].domainId)
            domainIds.add(item.Items[0].appId)
        }
    }
    return domainIds;
};