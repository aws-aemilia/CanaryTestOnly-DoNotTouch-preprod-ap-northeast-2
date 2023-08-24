import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Commons/Isengard";
import { Kinesis, PutRecordsCommandInput } from "@aws-sdk/client-kinesis";
import { toRegionName } from "../../Commons/utils/regions";

let kinesis: Kinesis;
const DATA_STREAM_NAME = "CloudFrontDistributionLogs";

const RECORDS_PER_PUT_RECORDS_REQUEST = 500;

async function getArgs() {
  return (await yargs(hideBin(process.argv))
    .usage(
      `Simulate a cache-busting attack by putting access log records corresponding to cache misses on the ${DATA_STREAM_NAME} data stream.`
    )
    .option("stage", {
      describe: `Stage to simulate the attack in.`,
      type: "string",
      default: "beta",
      choices: ["beta", "gamma", "preprod"],
    })
    .option("region", {
      describe: `Region to simulate the attack in (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
      default: "pdx",
    })
    .option("batches", {
      describe: `Number of ${RECORDS_PER_PUT_RECORDS_REQUEST}-record batches that will be put on the data stream.`,
      type: "number",
      default: 20,
    })
    .option("domainId", {
      describe: `Domain ID of the distribution to simulate the attack on (e.g. "d3k6jeooq31aqs").`,
      type: "string",
      default: "d3k6jeooq31aqs",
    })
    .option("status", {
      describe: `Status code of the access log records (e.g. 200, 429, 503)`,
      type: "number",
      default: 200,
    })
    .option("resultType", {
      describe: `x-edge-result-type of the access log records (e.g. "Miss", "Error", "Hit")`,
      type: "string",
      default: "Miss",
    })
    .strict()
    .version(false)
    .help().argv) as {
    stage: Stage;
    region: Region;
    batches: number;
    domainId: string;
    status: number;
    resultType: string;
  };
}

async function setKinesisClient(stage: Stage, region: Region) {
  const controlPlaneAccount_ = await controlPlaneAccount(stage, region);
  const regionName = toRegionName(region);

  kinesis = new Kinesis({
    region: regionName,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount_.accountId,
      "OncallOperator"
    ),
  });
}

async function putRecordsClosure(putRecordsRequest: PutRecordsCommandInput) {
  await kinesis.putRecords(putRecordsRequest);
  // This log is useful for tracking the time between when this script is run and when the mitigation is completed.
  console.log(`Sent PutRecords request at ${new Date().toISOString()}.`);
}

async function main() {
  const { stage, region, batches, domainId, status, resultType } =
    await getArgs();
  await setKinesisClient(stage, region);

  const requestLog = `1669878400.397\t52.94.133.130\t0.134\t${status}\t1843\tGET\thttps\tmain.d2rbngvo9fqezp.amplifyapp.com\t/path\t64\tIAD12-P4\tDHj-cd7P5BFzmo_gfh4rrWbm3NsJ1Pt0ta-76dtvbrbCYtdClKOoYQ==\t${domainId}.cloudfront.net\t0.134\tHTTP/2.0\tIPv4\tcurl/7.79.1\t-\t-\tq=123\tMiss\t-\tTLSv1.3\tTLS_AES_128_GCM_SHA256\t${resultType}\t-\t-\ttext/html\t1434\t-\t-\t19506\tMiss\tUS\t-\t*/*\t*\thost:main.d2rbngvo9fqezp.amplifyapp.com%0Auser-agent:curl/7.79.1%0Aaccept:*/*%0ACloudFront-Viewer-Country:US%0A\thost%0Auser-agent%0Aaccept%0ACloudFront-Viewer-Country%0A\t4`;
  const record = {
    Data: Uint8Array.from(Buffer.from(requestLog)), // Kinesis requires the data as an Uint8Array.
    PartitionKey: domainId, // Under normal conditions, the domain ID is used as the partition key too.
  };
  const putRecordsRequest = {
    Records: new Array(RECORDS_PER_PUT_RECORDS_REQUEST).fill(record),
    StreamName: DATA_STREAM_NAME,
  };

  let putRecordsArray: Promise<void>[] = [];
  for (let i = 0; i < batches; i++) {
    putRecordsArray.push(putRecordsClosure(putRecordsRequest));
  }
  await Promise.all(putRecordsArray);
}

main()
  .then()
  .catch((e) => console.warn(e));
