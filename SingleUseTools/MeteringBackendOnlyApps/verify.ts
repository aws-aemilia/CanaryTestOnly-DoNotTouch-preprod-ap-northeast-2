import { controlPlaneAccount, Region, Stage } from "../../Commons/Isengard";
import { getApps, toDistroARN } from "./libs/commons";
import { MeteringEventsService } from "./libs/MeteringEventsService";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import logger from "../../Commons/utils/logger";

async function verify(stage: string, region: string) {
  const acc = await controlPlaneAccount(stage as Stage, region as Region);
  const allApps = await getApps(acc);
  const branchlessApps = allApps.withoutBranches;
  const appsWithBranches = allApps.withBranches;

  const meteringEventsService = new MeteringEventsService(stage, region);
  await meteringEventsService.init();

  const badApps = branchlessApps.filter(
    (app) =>
      !meteringEventsService.isStopped(
        toDistroARN(acc, app.cloudFrontDistributionId)
      )
  );

  const brokenApps = appsWithBranches.filter(
    (app) =>
      meteringEventsService.isStopped(
        toDistroARN(acc, app.cloudFrontDistributionId)
      )
  )

  logger.info(`
Stage: ${stage}, Region: ${region}
Found ${branchlessApps.length} branch-less apps. 

Found ${badApps.length} branch-less Apps that do NOT have hosting metering STOPPED.

Found ${appsWithBranches.length} apps with branches.

Found ${brokenApps.length} apps with branches that DO have hosting metering STOPPED.
`);

  if (badApps.length > 0) {
    throw new Error(
      `Found ${badApps.length} branch-less Apps that do NOT have hosting metering STOPPED: ${badApps.map(app => `\n${app.appId}: ${app.createTime}`)}`
    );
  } else if (brokenApps.length > 0) {
    throw new Error(
      `Found ${brokenApps.length} apps with branches that DO have hosting metering STOPPED. ${brokenApps.map(app => `\n${app.appId}: ${app.createTime}`)}`
    );
  } else {
    logger.info("Verification succeeded!");
  }
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Verifies that HostingDataTransferOut is STOPPED for all branch-less Apps
        
        It finds all branch-less Apps and verifies that their latest metering message is a STOP. 
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
    .option("mcm", {
      describe: "i.e. MCM-73116970. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  process.env.ISENGARD_MCM = args.mcm;
  const {stage, region} = args

  await verify(stage, region);
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
