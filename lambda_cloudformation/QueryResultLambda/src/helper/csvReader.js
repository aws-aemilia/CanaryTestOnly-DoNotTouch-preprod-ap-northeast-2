const csv = require("csvtojson");

module.exports = csvReader = async (originCSV) => {
    // Extract domainIds from host data field
    const data = await csv().fromStream(originCSV);
    let domainIds = new Set();
    data.forEach((element) => domainIds.add(element.host.split(".")[0]));
    return domainIds;
};
