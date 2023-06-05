const helper = require("../utils/cveHelper.js");
const RecordProcessor = require("../processor/RecordProcessor");

const dummyChromeCVERecord = {
    cve_id: "CVE-2021-99999",
    summary:
        "TabGroups in Google Chrome prior to 91.0.4472.114 allowed an attacker...",
    url: "http://www.cvedetails.com/cve/CVE-2021-99999/",
};

const dummyNonChromeCVERecord = {
    cve_id: "CVE-2021-00000",
    summary:
        "Sage X3 System CHAINE Variable Script Command Injection. An authenticated user ...",
    url: "http://www.cvedetails.com/cve/CVE-2021-00000/",
};

describe("Test Record Processor", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should update history table and send notification when new Google Chrome CVE is found", async (done) => {
        const getRecord = jest.spyOn(helper, "getRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve({
                    Item: null,
                });
            })
        );
        const putRecord = jest.spyOn(helper, "putRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve();
            })
        );
        const sendNotification = jest
            .spyOn(helper, "sendNotification")
            .mockReturnValue(
                new Promise((resolve, reject) => {
                    resolve();
                })
            );

        await RecordProcessor.processRecord(dummyChromeCVERecord);

        expect(getRecord.mock.calls.length).toBe(1);
        expect(putRecord.mock.calls.length).toBe(1);
        expect(sendNotification.mock.calls.length).toBe(1);
        done();
    });

    it("should not update history table and send notification when history record is found", async (done) => {
        const getRecord = jest.spyOn(helper, "getRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve({
                    Item: dummyChromeCVERecord,
                });
            })
        );
        const putRecord = jest.spyOn(helper, "putRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve();
            })
        );
        const sendNotification = jest
            .spyOn(helper, "sendNotification")
            .mockReturnValue(
                new Promise((resolve, reject) => {
                    resolve();
                })
            );

        await RecordProcessor.processRecord(dummyChromeCVERecord);

        expect(getRecord.mock.calls.length).toBe(1);
        expect(putRecord.mock.calls.length).toBe(0);
        expect(sendNotification.mock.calls.length).toBe(0);
        done();
    });

    it("should not update history table and send notification when new other CVE is found", async (done) => {
        const getRecord = jest.spyOn(helper, "getRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve({
                    Item: dummyNonChromeCVERecord,
                });
            })
        );
        const putRecord = jest.spyOn(helper, "putRecord").mockReturnValue(
            new Promise((resolve, reject) => {
                resolve();
            })
        );
        const sendNotification = jest
            .spyOn(helper, "sendNotification")
            .mockReturnValue(
                new Promise((resolve, reject) => {
                    resolve();
                })
            );

        await RecordProcessor.processRecord(dummyNonChromeCVERecord);

        expect(getRecord.mock.calls.length).toBe(0);
        expect(putRecord.mock.calls.length).toBe(0);
        expect(sendNotification.mock.calls.length).toBe(0);
        done();
    });
});
