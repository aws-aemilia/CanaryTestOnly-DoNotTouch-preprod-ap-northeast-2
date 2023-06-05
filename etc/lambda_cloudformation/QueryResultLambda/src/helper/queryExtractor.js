module.exports = queryExtractor = (result, queryType) => {
    let eventType;
    let queryTime
    const queryContent = result.QueryExecution.Query;
    if(queryType === "ErrorCode"){
        [queryTime, eventType] = errorCodeQueryExtractor(queryContent)
    }else{
        [queryTime, eventType] = patternQueryExtractor(queryContent)
    }
    return [queryTime, eventType]
};

const errorCodeQueryExtractor = (queryContent) => {
    // Retrieve params from query content
    const queryParams = queryContent.match(/(\d+)/g);
    const time = queryParams.slice(0, -2);
    const errorCodeEnd = queryParams[queryParams.length - 1];
    let queryTime;
    let eventType;
    if (errorCodeEnd == 499) {
        eventType = "E-4XX";
    } else if (errorCodeEnd == 599) {
        eventType = "E-5XX";
    } else {
        eventType = "E-" + errorCodeEnd;
    }
    queryTime = time.join("-");

    return [queryTime, eventType];
}

const patternQueryExtractor = (queryContent) => {
    // Retrieve params from query content
    const timePart = queryContent.split('(')[0];
    const time = timePart.match(/(\d+)/g);
    let pattern = queryContent.match(/'%.*?%'/)[0].slice(2,-2);
    let queryTime = time.join("-");

    // Replace special character
    pattern = pattern.replace("\\%","%");
    pattern = pattern.replace("\\_","_");
    pattern = pattern.replace("''","'");
    let eventType = "P-" + pattern;
    return [queryTime, eventType]
}

