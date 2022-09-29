import fs from "fs";
import readline from "readline";

interface RecordLine {
  resourceId: string;
  resource: string;
  payerId: string;
  platformToken: string;
  productCode: string;
  partitionKey: string;
  meteringHourTimestamp: string;
  markAsDeleted: string;
  ActivateTimestamp: string;
  value: string;
  operation: string;
  isProrated: string;
  usageType: string;
}

interface BranchArnStoragePrefixMap {
  branchArn: string;
  usageType: string;
  storagePathPrefix: string;
}

/**
 * Example line in Records file
 *
 * {
    "resourceId": "arn:aws:amplify:ap-northeast-1:631808478805:apps/d2l377nyzwxh55/branches/staging,APN1-DataStorage,AWSAmplify,HostingStorage,232123326645,d2l377nyzwxh55/staging/0000000039/whu4u4h76bcblb5yxkhqqammzq",
    "resource": "arn:aws:amplify:ap-northeast-1:631808478805:apps/d2l377nyzwxh55/branches/staging",
    "payerId": "232123326645",
    "platformToken": "232123326645",
    "productCode": "AWSAmplify",
    "partitionKey": "amplify-AWSAmplify-f1",
    "meteringHourTimestamp": "1591488000000",
    "markAsDeleted": "false",
    "ActivateTimestamp": "1591632594490",
    "value": "48146737",
    "operation": "HostingStorage",
    "isProrated": "true",
    "usageType": "APN1-DataStorage"
 * }
 */

export class RemoRecordsReader {
  private rl: readline.Interface;

  constructor(filename: string) {
    const fileStream = fs.createReadStream(filename);
    this.rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
  }

  public async readLines(
    callback: (line: string, lineContents: BranchArnStoragePrefixMap) => void
  ) {
    for await (const line of this.rl) {
      const record = JSON.parse(line) as RecordLine;
      const resourceIdCsv = record.resourceId.split(",");
      if (resourceIdCsv.length < 6) {
        throw new Error(`Malformed recordId CSV: ${line}`);
      }
      callback(line, {
        branchArn: resourceIdCsv[0],
        usageType: record.usageType,
        storagePathPrefix: resourceIdCsv[5],
      });
    }
  }
}
