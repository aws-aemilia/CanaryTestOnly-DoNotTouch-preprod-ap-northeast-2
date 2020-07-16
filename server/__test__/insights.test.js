const mapAppIdToAccountId = require("../extensions/insightsHelper/mapAccountId");
const queryHelper = require("../extensions/queryHelper") 

describe("Test mapAppIdToAccountId", () => {
    it("should return accountIds", () => {
        const data = [
            {
                id: [
                    {
                        accountId: "1",
                        appId: "1",
                    },
                    {
                        accountId: "2",
                        appId: "2",
                    },
                    {
                        accountId: "3",
                        appId: "3",
                    },
                    {
                        accountId: "3",
                        appId: "4",
                    },
                ],
                region: "test"
            },
            {
                id: [
                    {
                        accountId: "1",
                        appId: "10",
                    },
                    {
                        accountId: "2",
                        appId: "20",
                    },
                    {
                        accountId: "3",
                        appId: "30",
                    },
                    {
                        accountId: "3",
                        appId: "40",
                    },
                ],
                region: "beta"
            },
        ];

        const expected = [
            {
                accountId: "1",
                appId: ["1","10"],
                regions: ["test","beta"]
            },
            {
                accountId: "2",
                appId: ["2","20"],
                regions: ["test","beta"]
            },
            {
                accountId: "3",
                appId: ["3", "4", "30", "40"],
                regions: ["test","beta"]
            },
        ];

        expect(mapAppIdToAccountId(data)).toStrictEqual(expected);
    });
    
    it("should handle null case", () => {
        const data = [
            {
                id: [
                    {
                        accountId: "1",
                        appId: "1",
                    },
                    {
                        accountId: "2",
                        appId: "2",
                    },
                    {
                        accountId: "3",
                        appId: "3",
                    },
                    {
                        accountId: "3",
                        appId: "4",
                    },
                ],
                region: "test"
            },
            {
                id: [],
                region: "beta"
            },
        ];

        const expected = [
            {
                accountId: "1",
                appId: ["1"],
                regions: ["test"]
            },
            {
                accountId: "2",
                appId: ["2"],
                regions: ["test"]
            },
            {
                accountId: "3",
                appId: ["3", "4"],
                regions: ["test"]
            },
        ];

        expect(mapAppIdToAccountId(data)).toStrictEqual(expected);
    });
});

describe("Test queryHelper", ()=>{
    it("should generate query correctly with minute", ()=>{
        const timeRange = 'm'
        const time = 1593191530
        const eventType = 'E-503'
        const queryType = "ErrorCode"
        const query = "2020-06-26-17-12"
        const queryContent = `SELECT "$path" FROM "partitioned_gz_logs" 
                        WHERE year = '2020' 
                        AND month = '06' 
                        AND day = '26' 
                        AND time LIKE '17:12%'
                        AND status >= 503
                        AND status <= 503`;
        const expected = [query, queryType, queryContent]
        expect(queryHelper(timeRange, time, eventType)).toStrictEqual(expected);
    })
})
