import yargs from "yargs";
import {
  computeServiceControlPlaneAccounts,
  computeServiceDataPlaneAccounts,
} from "../../Commons/Isengard";
import { addAccountsToServicePrincipal } from "../../Commons/NAPS";

const servicePrincipals: Record<string, string> = {
  beta: "gamma.compute.amplify.aws.internal",
  gamma: "gamma.compute.amplify.aws.internal",
  prod: "compute.amplify.aws.internal",
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
          Adds all Compute Service accounts (both control plane and cell accounts) to the corresponding Service Principal
          `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("accountId", {
      describe:
        "optionally specify a single account to add. This may be convenient/faster when you know that you are adding a single new account",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, accountId } = args;

  const accounts = [
    ...(await computeServiceControlPlaneAccounts()),
    ...(await computeServiceDataPlaneAccounts()),
  ].filter(
    (a) =>
      a.stage === stage &&
      (accountId === undefined || a.accountId === accountId)
  );

  if (accounts.length === 0 && accountId) {
    throw new Error(
      `The account ${accountId} is not recognized as a ${stage} Compute Service account`
    );
  }

  const servicePrincipal = servicePrincipals[stage];

  console.log(`adding ${accounts.length} accounts to ${servicePrincipal}`);

  await addAccountsToServicePrincipal(accounts, servicePrincipal);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
