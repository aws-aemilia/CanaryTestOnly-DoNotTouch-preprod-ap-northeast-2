import { getRolesForStage } from "../Commons/Isengard/roles/standardRoles";
import {
  AmplifyAccount,
  AmplifyAccountType,
  getAccountsLookupFn,
  preflightCAZ,
} from "../Commons/Isengard";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const main = async () => {
  const stage = "prod";
  const roleNames = Object.values(getRolesForStage(stage)).map(
    (r) => r.IAMRoleName
  );

  const args = await yargs(hideBin(process.argv))
    .usage(
      `Create CAZ request for all accounts of a kind
      

      npx ts-node OpsTools/caz.ts --accountType controlPlane --role OncallOperator
      `
    )
    .option("accountType", {
      describe: "If not present it syncs roles in ALL accountTypes",
      type: "string",
      choices: Object.values(AmplifyAccountType),
    })
    .option("role", {
      describe: "If not present it syncs roles in ALL accountTypes",
      type: "string",
      choices: roleNames,
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { accountType, role } = args;

  const accounts: AmplifyAccount[] = accountType
    ? await getAccountsLookupFn[accountType]({ stage })
    : (
        await Promise.all(
          Object.values(getAccountsLookupFn).map((fn) =>
            fn({
              stage,
            })
          )
        )
      ).flatMap((x) => x);

  await preflightCAZ({
    accounts,
    role,
  });
};

main().catch(console.error);
