import dotenv from "dotenv";
import yargs from "yargs";
import { MyAmplifyClient } from "./MyAmplifyClient";

dotenv.config();

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Run a batch of CloudWatch LogInsights queries based on the provided QueryConfig.
    This batch could be across different regions or different time ranges if the 
    query cannot be completed in 1 hour.

    Make sure you add your query to OpsTools/queries/index.ts and then reference it 
    in queryId argument

    Usage:
    npx ts-node OpsTools/batchQuery.ts --cancelRunningQueries=true --queryId="CostBasedThrottlesQuery"
    `
    )
    .option("stage", {
      type: "string",
      demandOption: true,
    })
    .option("region", {
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  const amplify = new MyAmplifyClient(stage, region);
  const apps = await amplify.listApps();
  const appsList = apps.map((a) => a.name).sort();
  console.log("Found ", appsList.length, "apps");
  console.log(appsList);
  // appsList.forEach(console.log);
}

main().catch((e) => {
  console.log("Failed to run main", e);

  process.exit(1);
});
