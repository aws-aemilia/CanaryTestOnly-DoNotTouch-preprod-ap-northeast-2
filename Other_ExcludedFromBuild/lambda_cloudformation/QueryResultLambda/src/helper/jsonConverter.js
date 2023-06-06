module.exports = jsonConverter = (scanResults) => {
    let jsonFile;
    let items = [];
    if (scanResults.length == 0) {
        items.push(null);
        jsonFile = JSON.stringify(items);
    } else {
        for (let item of scanResults) {
            items.push(item.Item);
        }
        jsonFile = JSON.stringify(items);
    }
    return jsonFile;
};
