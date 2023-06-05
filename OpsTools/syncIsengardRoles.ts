import { getRolesForStage } from "../Isengard/roles/standardRoles";
import { AmplifyAccount, AmplifyAccountType, controlPlaneAccounts, getAccountsLookupFn, Region, } from "../Isengard";
import { upsertRole } from "../Isengard/roles/upsertRole";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
    Sync all Isengard roles in prod accounts. This is useful when an Isengard Policy 
    is updated or when the role properties are modified on node-scripts/Isengard/roles/standardRoles.ts
    `
    )
    .option("region", {
      describe: "i.e. us-west-2. If not present it syncs roles in ALL regions",
      type: "string",
    })
    .option("accountType", {
      describe: "If not present it syncs roles in ALL accountTypes",
      type: "string",
      choices: Object.values(AmplifyAccountType),
    })
    .strict()
    .version(false)
    .help().argv;

  const { accountType } = args;
  const region = args.region as Region;

  const stage = "prod";
  const roles = getRolesForStage(stage);

  // Roles that should exist in all of our service accounts.
  const commonRoles = [
    roles.FullReadOnly,
    roles.ReadOnly,
    roles.OncallOperator,
  ];

  // Roles that shoud only exist in Control Plane accounts.
  const controlPlaneAccountRoles = [
    roles.MobileCoreSupport,
    roles.ReleaseCustomDomain,
  ];

  const accounts: AmplifyAccount[] = accountType
    ? await getAccountsLookupFn[accountType]({ stage, region })
    : (
        await Promise.all(
          Object.values(getAccountsLookupFn).map((fn) =>
            fn({
              stage,
              region,
            })
          )
        )
      ).flatMap((x) => x);

  for (const account of accounts) {
    console.log(`>> Updating roles for account ${account.email}`);
    for (const role of commonRoles) {
      console.log(`>> Updating role ${role.IAMRoleName}`);
      await upsertRole(account.accountId, role);
    }
  }

  if (!accountType || accountType === "controlPlane") {
    const cpAccounts = await controlPlaneAccounts({ stage, region });
    for (const account of cpAccounts) {
      console.log(`>> Updating roles for account ${account.email}`);
      for (const role of controlPlaneAccountRoles) {
        console.log(`>> Updating role ${role.IAMRoleName}`);
        await upsertRole(account.accountId, role);
      }
    }
  }
};

main().then(console.log).catch(console.error);
