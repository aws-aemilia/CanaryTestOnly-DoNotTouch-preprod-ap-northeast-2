const queryExtractor = require("../src/helper/queryExtractor");

describe("test queryExtractor", () => {
    it("should extract query information", () => {
        const queryContent = `SELECT "$path" FROM "partitioned_gz_logs" 
        WHERE year = '2020' 
        AND month = '01'
        AND day = '01'
        AND status >= 400
        AND status <= 499`;
        const athenaRes = {
            QueryExecution: {
                Query: queryContent,
                QueryExecutionId: "string",
            },
        };
        const [queryTime, eventType] = queryExtractor(athenaRes, "ErrorCode");
        expect(queryTime).toBe("2020-01-01");
        expect(eventType).toBe("E-4XX");
    });

    it("should extract query information", () => {
        const queryContent = `SELECT "$path" FROM "partitioned_gz_logs" 
        WHERE year = '2020' 
        AND month = '06' 
        AND day = '26' 
        AND time LIKE '17:12%'
        AND status >= 503
        AND status <= 503`;
        const athenaRes = {
            QueryExecution: {
                Query: queryContent,
                QueryExecutionId: "string",
            },
        };
        const [queryTime, eventType] = queryExtractor(athenaRes, "ErrorCode");
        expect(queryTime).toBe("2020-06-26-17-12");
        expect(eventType).toBe("E-503");
    });

    it("should extract query information", () => {
        const queryContent = `SELECT "$path" FROM "partitioned_gz" 
        WHERE year = '2020' 
        AND month = '01'
        AND (location LIKE '%EWR%' OR requestip LIKE '%EWR%' OR method LIKE '%EWR%' OR host LIKE '%EWR%' 
        OR uri LIKE '%EWR%' OR referrer LIKE '%EWR%' OR useragent LIKE '%EWR%' OR querystring LIKE '%EWR%' 
        OR cookie LIKE '%EWR%' OR resulttype LIKE '%EWR%' OR requestid LIKE '%EWR%' OR hostheader LIKE '%EWR%' 
        OR requestprotocol LIKE '%EWR%' OR xforwardedfor LIKE '%EWR%' OR sslprotocol LIKE '%EWR%' 
        OR sslcipher LIKE '%EWR%' OR responseresulttype LIKE '%EWR%' OR httpversion LIKE '%EWR%' OR filestatus LIKE '%EWR%')`;
        const athenaRes = {
            QueryExecution: {
                Query: queryContent,
                QueryExecutionId: "string",
            },
        };
        const [queryTime, eventType] = queryExtractor(athenaRes, "Pattern");
        expect(queryTime).toBe("2020-01");
        expect(eventType).toBe("P-EWR");
    });
});
