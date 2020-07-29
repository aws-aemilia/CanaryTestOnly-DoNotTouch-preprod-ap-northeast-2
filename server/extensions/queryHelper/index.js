const timeStampParser = (time) => {
    // Parse the timestamp
    const selectedTime = new Date(time * 1000);
    let year = selectedTime.getUTCFullYear();
    let month = selectedTime.getUTCMonth() + 1;
    if (month < 10) month = "0" + month;
    let day = selectedTime.getUTCDate();
    if (day < 10) day = "0" + day;
    let hour = selectedTime.getUTCHours();
    if (hour < 10) hour = "0" + hour;
    let minute = selectedTime.getUTCMinutes();
    if (minute < 10) minute = "0" + minute;
    let second = selectedTime.getUTCSeconds();
    if (second < 10) second = "0" + second;
    return [year, month, day, hour, minute, second];
};

const errorCodeQueryHelper = (timeRange, time, errorCode) => {
    // Parse the timestamp
    const [year, month, day, hour, minute, second] = timeStampParser(time);

    // Parse the ErrorCode
    let errorCodeStart;
    let errorCodeEnd;
    if (errorCode === "5XX") {
        errorCodeStart = 500;
        errorCodeEnd = 599;
    } else if (errorCode === "4XX") {
        errorCodeStart = 400;
        errorCodeEnd = 499;
    } else {
        errorCodeStart = parseInt(errorCode);
        errorCodeEnd = parseInt(errorCode);
    }

    // Generate queryTime and queryContent
    let queryTime;
    let queryContent;
    let queryType = "ErrorCode"
    if (timeRange === "S") {
        queryTime = year + "-" + month + "-" + day + "-" + hour + "-" + minute + "-" + second;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND time = '${hour}:${minute}:${second}'
                        AND status >= ${errorCodeStart}
                        AND status <= ${errorCodeEnd}`;
    } else if (timeRange === "m") {
        queryTime = year + "-" + month + "-" + day + "-" + hour + "-" + minute;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND time LIKE '${hour}:${minute}%'
                        AND status >= ${errorCodeStart}
                        AND status <= ${errorCodeEnd}`;
    } else if (timeRange === "H") {
        queryTime = year + "-" + month + "-" + day + "-" + hour;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND hour = '${hour}'
                        AND status >= ${errorCodeStart}
                        AND status <= ${errorCodeEnd}`;
    } else if (timeRange === "D") {
        queryTime = year + "-" + month + "-" + day;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND status >= ${errorCodeStart}
                        AND status <= ${errorCodeEnd}`;
    } else if (timeRange === "M") {
        queryTime = year + "-" + month;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND status >= ${errorCodeStart}
                        AND status <= ${errorCodeEnd}`;
    }

    return [queryTime, queryType, queryContent];
}

const patternQueryHelper = (timeRange, time, pattern) => {
    // Parse the timestamp
    const [year, month, day, hour, minute, second] = timeStampParser(time);
    let queryType = "Pattern";

    // Replace special character
    pattern = pattern.replace("%","\\%");
    pattern = pattern.replace("_","\\_");
    pattern = pattern.replace("'","''");

    // Generate query
    const logDataFields_Num = [
        "bytes",
        "status",
        "requestbytes",
        "timetaken",
        "encryptedfields",
        "cport",
        "timetofirstbyte",
    ]
    const logDataFields_String = [
        // "location",
        "requestip",
        "method",
        "host",
        "uri",
        "referrer",
        "useragent",
        "querystring",
        "cookie",
        "resulttype",
        "requestid",
        "hostheader",
        "requestprotocol",
        "xforwardedfor",
        "sslprotocol",
        "sslcipher",
        "responseresulttype",
        "httpversion",
        "filestatus",
    ];
    let patternMatchQuery = `LOWER(location) LIKE '%${pattern}%' ESCAPE '\\'`
    logDataFields_String.forEach((attribute) => {
        patternMatchQuery = patternMatchQuery + ` OR LOWER(${attribute}) LIKE '%${pattern}%' ESCAPE '\\'`
    })

    // Pattern contains number only, search all data fields
    if (/^\d+$/.test(pattern)){
        logDataFields_Num.forEach((attribute) => {
            patternMatchQuery = patternMatchQuery + ` OR  ${attribute} = ${pattern}`
        })
    }

    let queryContent;
    if (timeRange === "S") {
        // Query format : Year-Month-Day-Hour-Minute-Second
        queryTime = year + "-" + month + "-" + day + "-" + hour + "-" + minute + "-" + second;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND time = '${hour}:${minute}:${second}'
                        AND (${patternMatchQuery})`;
    } else if (timeRange === "m") {
        // Query format : Year-Month-Day-Hour-Minute
        queryTime = year + "-" + month + "-" + day + "-" + hour + "-" + minute;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND time LIKE '${hour}:${minute}%
                        AND (${patternMatchQuery})`;
    } else if (timeRange === "H") {
        // Query format : Year-Month-Day-Hour
        queryTime = year + "-" + month + "-" + day + "-" + hour;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}' 
                        AND hour = '${hour}'
                        AND (${patternMatchQuery})`;
    } else if (timeRange === "D") {
        // Query format : Year-Month-Day
        queryTime = year + "-" + month + "-" + day;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}' 
                        AND day = '${day}'
                        AND (${patternMatchQuery})`;
    } else if (timeRange === "M") {
        // Query format : Year-Month
        queryTime = year + "-" + month;
        queryContent = `SELECT "host" FROM "partitioned_parquet_logs" 
                        WHERE year = '${year}' 
                        AND month = '${month}'
                        AND (${patternMatchQuery})`;
    }
    return [queryTime, queryType, queryContent];
};

// Generator for Athena query
const queryHelper = (timeRange, time, eventType) => {
    // Parse the event
    const queryType = eventType.split("-")[0]
    if(queryType ==="E"){
        // Error Code Query
        const errorCode = eventType.split("-")[1]
        return errorCodeQueryHelper(timeRange, time, errorCode)
    }else{
        const pattern = eventType.slice(2)
        return patternQueryHelper(timeRange, time, pattern)
    }
};

module.exports = queryHelper;
