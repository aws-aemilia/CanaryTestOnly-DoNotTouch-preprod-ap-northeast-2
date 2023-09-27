import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { join } from "node:path";
import { AhioTrafficReplayArgs } from "./types";
import dayjs from "dayjs";

const DEFAULT_OUTPUT_DIR = "./tmp/ahioTrafficReplayResults";
const DEFAULT_REGION_CONCURRENCY = 10;

export async function getArgs(): Promise<AhioTrafficReplayArgs> {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Run AHIO Traffic Replay validation

      Default output dir: ${DEFAULT_OUTPUT_DIR}

      Usage:
      npx ts-node SingleUseTools/ahio-traffic-replay/run.ts \
        --stage prod \

      Usage with all options set:
      brazil-build globalQuery \
        --stage prod \
        --startDate '2023-04-02T00:00:00-00:00' \
        --endDate '2023-04-08T00:00:00-00:00' \
        --concurrentRequestsPerRegion 5
        --outputDir ./output
      `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("startDate", {
      describe:
        "Query start date in ISO format for locating traffic to replay, for example 2022-04-01T00:00:00 (defaults to 1 day ago)",
      type: "string",
      demandOption: false,
    })
    .option("endDate", {
      describe:
        "Query end date in ISO format for locating traffic to replay, for example 2022-04-01T00:00:00 (defaults to now)",
      type: "string",
      demandOption: false,
    })
    .option("concurrentRequestsPerRegion", {
      describe:
        "Maximum number of concurrent requests to allow per region (defaults to 10)",
      type: "number",
      default: 10,
      demandOption: false,
    })
    .option("outputDir", {
      describe:
        "Folder to output all results (defaults to ./tmp/ahioTrafficReplayResults)",
      type: "string",
      demandOption: false,
    })
    .option("region", {
      describe:
        "Limit searching and requests to a specific region (default to all regions)",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  return {
    concurrentRequestsPerRegion:
      args.concurrentRequestsPerRegion || DEFAULT_REGION_CONCURRENCY,
    endDate: new Date(args.endDate || dayjs().format()),
    outputDir: args.outputDir || join(__dirname, "../../", DEFAULT_OUTPUT_DIR),
    region: args.region,
    stage: args.stage,
    startDate: new Date(args.startDate || dayjs().subtract(2, "minutes").format()),
  };
}
