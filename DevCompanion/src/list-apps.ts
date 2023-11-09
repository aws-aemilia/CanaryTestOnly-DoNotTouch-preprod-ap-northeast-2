import yargs from "yargs";
import { MyAmplifyClient } from "./MyAmplifyClient";

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
