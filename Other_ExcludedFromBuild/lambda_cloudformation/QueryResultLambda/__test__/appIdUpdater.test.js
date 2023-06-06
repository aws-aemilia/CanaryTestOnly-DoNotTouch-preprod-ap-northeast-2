const appIdUpdater = require("../src/helper/appIdUpdater");

describe("test appIdUpdater", () => {
    it("should update app ids", () => {
        const domainIds = new Set(["a1omrh9xxw15k9","b1omrh9xxw15k9"]);
        const DomainDDBQueryResults = [
            { Items: [], Count: 0, ScannedCount: 0 },
            {
                Items: [{ domainId: "a1omrh9xxw15k9", appId: "1000" }],
                Count: 1,
                ScannedCount: 1,
            },
        ];
        const result = appIdUpdater(DomainDDBQueryResults, domainIds);
        const expected = new Set(['1000','b1omrh9xxw15k9'])
        expect(result).toStrictEqual(expected);
    });

    it("should handle null case", ()=>{
        const domainIds = new Set();
        const DomainDDBQueryResults = []
        const result = appIdUpdater(DomainDDBQueryResults, domainIds);
        const expected = new Set();
        expect(result).toStrictEqual(expected)
    })
});
