import yargs from "yargs";
import { MyAmplifyClient } from "./MyAmplifyClient";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .option("appId", {
      describe: "app Id to delete",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const appId = args.appId;

  const amplifyClient = new MyAmplifyClient();
  const res = await amplifyClient.deleteApp(appId);
  console.info(res);
}

main().catch((e) => {
  console.log("Failed to run main", e);

  process.exit(1);
});
