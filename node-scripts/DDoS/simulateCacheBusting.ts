import yargs from "yargs";
import {hideBin} from "yargs/helpers";
import {controlPlaneAccount, getIsengardCredentialsProvider, Region, Stage} from "../Isengard";
import {Kinesis, PutRecordsCommandInput, PutRecordsRequestEntry} from "@aws-sdk/client-kinesis";
import {toRegionName} from "../utils/regions";

let kinesis: Kinesis;
const DATA_STREAM_NAME = "CloudFrontDistributionLogs";

const RECORDS_PER_PUT_RECORDS_REQUEST = 500;

async function getArgs() {
  return (await yargs(hideBin(process.argv))
    .usage(`Simulate a cache-busting attack by putting access log records with unique query strings on the ${DATA_STREAM_NAME} data stream.`)
    .option("stage", {
      describe: `Stage to simulate the attack in (e.g. "beta", "gamma", "prod).`,
      type: "string",
      default: "beta",
    })
    .option("region", {
      describe: `Region to simulate the attack in (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
      default: "pdx",
    })
    .option("records", {
      describe: `Number of records, each corresponding to a CloudFront access log with a unique query string, that will be put on the data stream. Note that this gets rounded down to the nearest multiple of 500, so setting this less than 500 will result in no records being put on the data stream.`,
      type: "number",
      default: 50000,
    })
    .option("domain",{
      describe: `Domain to simulate the attack on (e.g. "d3k6jeooq31aqs").`,
      type: "string",
      default: "d3k6jeooq31aqs",
    })
    .strict()
    .version(false)
    .help().argv) as {
    stage: Stage;
    region: Region;
    records: number;
    domain: string;
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

function range(start: number, stop: number) {
  // I wish this could be more elegant, but...
  // https://stackoverflow.com/questions/3746725/how-to-create-an-array-containing-1-n
  let result: number[] = []
  for (let i = 0; i < stop - start; i++) {
    result.push(start + i);
  }

  return result;
}

function generateRequestLog(queryString: string, domainId: string) {
  // This is a sample CloudFront access log, with the cs-uri-stem replaced with queryString and x-host-header replaced
  // with domainId.
  return `1669878400.397\t52.94.133.130\t0.134\t200\t1843\tGET\thttps\tmain.d2rbngvo9fqezp.amplifyapp.com\t/path?q=${queryString}\t64\tIAD12-P4\tDHj-cd7P5BFzmo_gfh4rrWbm3NsJ1Pt0ta-76dtvbrbCYtdClKOoYQ==\t${domainId}.cloudfront.net\t0.134\tHTTP/2.0\tIPv4\tcurl/7.79.1\t-\t-\tq=123\tMiss\t-\tTLSv1.3\tTLS_AES_128_GCM_SHA256\tMiss\t-\t-\ttext/html\t1434\t-\t-\t19506\tMiss\tUS\t-\t*/*\t*\thost:main.d2rbngvo9fqezp.amplifyapp.com%0Auser-agent:curl/7.79.1%0Aaccept:*/*%0ACloudFront-Viewer-Country:US%0A\thost%0Auser-agent%0Aaccept%0ACloudFront-Viewer-Country%0A\t4`
}

function generateRecord(queryString: string, domainId: string): PutRecordsRequestEntry {
  const requestLog = generateRequestLog(queryString, domainId);
  // The record data needs to be a Uint8Array, but it doesn't need to be base64-encoded. However, testing in the Lambda
  // console requires the record data to be base64-encoded, but not a Uint8Array.
  const data = Uint8Array.from(Buffer.from(requestLog));
  return {
    Data: data,
    PartitionKey: queryString,
  }
}

function* generateRecords(domainId: string) {
  // Generator function that, when called, generates enough records with unique query string to fill a PutRecords request.
  let i = 0;
  let nums: number[];

  while (true) {
    nums = range(i, i + RECORDS_PER_PUT_RECORDS_REQUEST);
    yield nums.map(num => generateRecord(num.toString(), domainId));
    i += RECORDS_PER_PUT_RECORDS_REQUEST;
  }
}

function domainToDomainId(domain: string) {
  // Naively convert the provided domain to the domain ID by getting the prefix.
  if (domain.includes(".")) {
    domain = domain.split(".")[0];
  }
  return domain;
}

async function main() {
  const { stage, region, records, domain } = await getArgs();
  await setKinesisClient(stage, region);
  const domainId = domainToDomainId(domain);
  const generator = generateRecords(domainId);

  const putRecordsRequestsTotal = Math.floor(records / RECORDS_PER_PUT_RECORDS_REQUEST);
  let putRecordsArray: Promise<void>[] = [];

  for (let i = 0; i < putRecordsRequestsTotal; i++) {
    const records = generator.next().value ?? [];
    const putRecordsRequest = {
      Records: records,
      StreamName: DATA_STREAM_NAME,
    };
    putRecordsArray.push(putRecordsClosure(putRecordsRequest));
  }

  await Promise.all(putRecordsArray);
}

async function putRecordsClosure(putRecordsRequest: PutRecordsCommandInput) {
  await kinesis.putRecords(putRecordsRequest);
  // This log is useful for tracking the time between when this script is run and when the mitigation is completed.
  console.log(`Sent PutRecords request at ${new Date().toISOString()}.`);
}

main().then()
  .catch(e => console.warn(e));