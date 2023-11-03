import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  computeServiceControlPlaneAccount,
  controlPlaneAccount,
  dataPlaneAccount,
  Stage,
} from "Commons/Isengard";
import { toRegionName } from "Commons/utils/regions";
import { RollbackAHIORegionCommand } from "./commands/RollbackAHIORegionCommand";
import { preflightCAZForAccountRoleCombinations } from "Commons/Isengard/contingentAuthZ";
import confirm from "Commons/utils/confirm";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `Roll back all AHIO deployments in a region

This tool will find all the active Jobs that were deployed with AHIO and roll them back by 
making a Compute Service deployment with the backup-bundle and then deleting the ImageSettings DDB record.

THIS TOOL IS INTENDED TO BE USED IN EMERGENCIES ONLY. 
ROLLING BACK AHIO HAS PERFORMANCE AND BILLING IMPLICATIONS.
`
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
    .option("onlyForAccount", {
      describe:
        "If provided, it only rolls back AHIO deployments for that account. Useful for testing the tool",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region);
  const onlyForAccount = args.onlyForAccount;

  if (stage === "prod") {
    const confirmation = await confirm(
      "THIS TOOL IS INTENDED TO BE USED IN EMERGENCIES ONLY. ROLLING BACK AHIO HAS PERFORMANCE AND BILLING IMPLICATIONS. \n>> Are you sure you want to continue?"
    );
    if (!confirmation) {
      console.log("Exiting");
      return;
    }
  }

  await preflightCAZForAccountRoleCombinations([
    { account: await controlPlaneAccount(stage, region), role: "FullReadOnly" },
    {
      account: await computeServiceControlPlaneAccount(stage, region),
      role: "OncallOperator",
    },
    { account: await dataPlaneAccount(stage, region), role: "AHIORollback" },
  ]);

  const rollbackAHIORegionCommand = new RollbackAHIORegionCommand(
    stage,
    region,
    { onlyForAccount }
  );

  await rollbackAHIORegionCommand.run();
}

main().then(console.log).catch(console.error);
