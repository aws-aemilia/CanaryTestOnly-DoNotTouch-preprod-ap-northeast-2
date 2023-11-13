import { controlPlaneAccount, preflightCAZ, Stage } from "Commons/Isengard";
import { VerifyCommand } from "./VerifyCommand";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { toRegionName } from "Commons/utils/regions";

// console.log all
require("util").inspect.defaultOptions.depth = null;
require("util").inspect.defaultOptions.maxArrayLength = null;

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Finds all the Jobs that used the deployment spec and prints information and links to do manual verification`
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("hoursAgo", {
      describe:
        "How many hours ago to look for Deployment Spec deployments. Defaults to 12 hours ago",
      type: "number",
      default: 12,
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region);

  await preflightCAZ({
    role: "FullReadOnly",
    accounts: [await controlPlaneAccount(stage, region)],
  });

  const verifyCommand = await VerifyCommand.buildDefault(stage, region);
  await verifyCommand.run(args.hoursAgo);
}

main().catch(console.error);
