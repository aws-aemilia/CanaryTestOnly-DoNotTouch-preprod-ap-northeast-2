import dotenv from "dotenv";
import yargs from "yargs";
import { MyAmplifyClient } from "./MyAmplifyClient";

dotenv.config();

async function main() {
  const args = await yargs(process.argv.slice(2))
    .option("stage", {
      type: "string",
      demandOption: true,
    })
    .option("region", {
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, appId } = args;

  const amplify = new MyAmplifyClient(stage, region);
  const res = await amplify.deleteApp(appId);
  console.log("App Deleted ", res);
}

main().catch((e) => {
  console.log("Failed to run main", e);

  process.exit(1);
});
