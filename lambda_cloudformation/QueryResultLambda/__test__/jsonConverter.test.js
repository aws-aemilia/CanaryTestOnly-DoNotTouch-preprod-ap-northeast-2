const jsonConverter = require("../src/helper/jsonConverter");

describe("test jsonConverter", () => {
    it("should convert scan result to JSON format", () => {
        const expected = JSON.stringify([
            {
                accountId: "1",
                appId: "1",
            },
            {
                accountId: "2",
                appId: "2",
            },
        ]);
        const scanResult = [
            {
                Item: {
                    accountId: "1",
                    appId: "1",
                },
            },
            {
                Item: {
                    accountId: "2",
                    appId: "2",
                },
            },
        ];
        expect(jsonConverter(scanResult)).toStrictEqual(expected);
    });

    it("should handle null case", () => {
        const expected = JSON.stringify([null]);
        const scanResult = [];
        expect(jsonConverter(scanResult)).toStrictEqual(expected);
    });
});
