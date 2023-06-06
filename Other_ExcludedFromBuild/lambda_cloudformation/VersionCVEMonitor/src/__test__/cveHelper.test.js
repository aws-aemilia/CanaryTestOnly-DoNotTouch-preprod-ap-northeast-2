const {
    getRecord,
    putRecord,
    sendNotification,
    isChromeCVE,
} = require("../utils/cveHelper.js");
const AWS = require("aws-sdk");
jest.mock("aws-sdk");

const dummyChromeCVERecord = {
    cve_id: "CVE-2021-99999",
    summary:
        "TabGroups in Google Chrome prior to 91.0.4472.114 allowed an attacker...",
    url: "http://www.cvedetails.com/cve/CVE-2021-99999/",
};

describe("Tests helper functions", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should return true when CVE summary is related to Google Chrome", async (done) => {
        const result = isChromeCVE(dummyChromeCVERecord);
        expect(result).toBe(true);
        done();
    });

    it("should get record from DynamoDB", async (done) => {
        const getMocked = jest.fn();
        getMocked.mockReturnValue({
            promise: jest.fn().mockReturnValue(
                new Promise((resolve, reject) => {
                    resolve(dummyChromeCVERecord);
                })
            ),
        });

        AWS.DynamoDB.DocumentClient.mockImplementation(() => {
            return { get: getMocked };
        });

        const history_record = await getRecord(dummyChromeCVERecord);
        expect(history_record).toBe(dummyChromeCVERecord);
        done();
    });

    it("should put record to DynamoDB", async (done) => {
        const putParams = {
            TableName: process.env.CVE_RECORD_HISTORY_TABLE,
            Item: {
                cveId: dummyChromeCVERecord.cve_id,
                summary: dummyChromeCVERecord.summary,
                url: dummyChromeCVERecord.url,
            },
        };

        const putMocked = jest.fn();
        putMocked.mockReturnValue({
            promise: jest.fn(),
        });

        AWS.DynamoDB.DocumentClient.mockImplementation(() => {
            return { put: putMocked };
        });

        await putRecord(dummyChromeCVERecord);
        expect(putMocked).toBeCalledWith(putParams);
        done();
    });

    it("should send email", async (done) => {
        const notificationMessage = `Immediate Action required! New Google Chrome ${dummyChromeCVERecord.cve_id} found, CVE summary is : ${dummyChromeCVERecord.summary}, CVE url is: ${dummyChromeCVERecord.url}, `;
        const emailParams = {
            Destination: {
                ToAddresses: ["aws-mobile-amplify@amazon.com"],
            },
            Message: {
                Body: {
                    Text: { Data: notificationMessage },
                },

                Subject: {
                    Data: `IMPORTANT: [Evaluation Required] !!!! New Google Chrome CVE: ${dummyChromeCVERecord.cve_id}`,
                },
            },
            Source: "aws-mobile-amplify@amazon.com",
        };

        const sendMocked = jest.fn();
        sendMocked.mockReturnValue({
            promise: jest.fn(),
        });

        AWS.SES.mockImplementation(() => {
            return { sendEmail: sendMocked };
        });

        await sendNotification(dummyChromeCVERecord);
        expect(sendMocked).toBeCalledWith(emailParams);
        done();
    });
});
