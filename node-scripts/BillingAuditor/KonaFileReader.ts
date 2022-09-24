import fs from "fs";
import readline from "readline";

interface KonaLine {
  payerId: string;
  productCode: string;
  clientProductCode: string;
  usageType: string;
  operation: string;
  internalAvailabilityZone: string;
  availabilityZone: string;
  resource: string;
  tagSetHash: string;
  startTime: string;
  endTime: string;
  value: string;
}

export class KonaFileReader {
  private rl: readline.Interface;

  constructor(filename: string) {
    const fileStream = fs.createReadStream(filename);
    this.rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });
  }

  public async readLines(
    callback: (line: string, lineContents: KonaLine) => void
  ) {
    for await (const line of this.rl) {
      const csvColumns = line.split(",");
      if (csvColumns.length < 12) {
        // Ignore the first few lines of meta data
        continue;
      }

      callback(line, {
        payerId: csvColumns[0],
        productCode: csvColumns[1],
        clientProductCode: csvColumns[2],
        usageType: csvColumns[3],
        operation: csvColumns[4],
        internalAvailabilityZone: csvColumns[5],
        availabilityZone: csvColumns[6],
        resource: csvColumns[7],
        tagSetHash: csvColumns[8],
        startTime: csvColumns[9],
        endTime: csvColumns[10],
        value: csvColumns[11],
      });
    }
  }
}
