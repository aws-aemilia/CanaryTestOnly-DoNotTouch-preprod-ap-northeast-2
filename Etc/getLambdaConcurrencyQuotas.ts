import { ServiceQuotasFacade } from "Commons/service-quotas/ServiceQuotasFacade";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import {
  computeServiceDataPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "../Commons/Isengard";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
This script is used to gather Lambda concurrency limits across all compute cell accounts.
Primarily used to update the limits in HostingDashboards

Example usage:
npx ts-node Etc/getLambdaConcurrencyQuotas.ts
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      default: "all",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;
  const stageName = stage as Stage;
  const parsedRegion = region === "all" ? undefined : toRegionName(region);

  const accounts = await computeServiceDataPlaneAccounts({
    stage: stageName,
    region: parsedRegion,
  });

  await preflightCAZ({
    accounts,
    role: StandardRoles.ReadOnly,
  });

  const quotas: { [region_cell: string]: number } = {};

  await Promise.all(
    accounts.map((a) => {
      const sq = new ServiceQuotasFacade(
        a.stage as Stage,
        a.region as Region,
        getIsengardCredentialsProvider(a.accountId, StandardRoles.ReadOnly)
      );
      return (
        sq
          .getQuota("lambda", "L-B99A9384") // concurrency
          //   .getQuota("lambda", "L-548AE339") // burst
          .then(
            (r) =>
              (quotas[a.region + "_" + a.cellNumber] = r?.Quota?.Value ?? 0)
          )
      );
    })
  );

  console.log(quotas);
};

main().catch((err) => {
  console.error(err), process.exit(1);
});
