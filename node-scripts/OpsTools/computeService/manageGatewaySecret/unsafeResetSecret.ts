import { AmplifyAccount, Region, Stage } from "../../../Isengard";
import { SecretStore } from "./secretStores/types";
import yargs from "yargs";
import {
  newSecret,
  readSecretFromAllLocations,
  writeSecretToAllLocations,
} from "./utils/utils";
import { getNamedSecretLocations } from "./secretStores/secretLocations";

const getSecretLocations = async (
  stage: Stage,
  region: Region
): Promise<{ account: AmplifyAccount; secretStore: SecretStore }[]> => {
  const namedSecretLocations = await getNamedSecretLocations(stage, region);
  return Object.values(namedSecretLocations).flatMap((s) =>
    Array.isArray(s) ? s : [s]
  );
};

const unsafeResetSecret = async (
  stage: Stage,
  region: Region,
  doUpdate: boolean = false
) => {
  const secretLocations = await getSecretLocations(stage, region);
  const secretValue = newSecret();

  const values = await readSecretFromAllLocations(secretLocations);
  console.log("Secret values before:");
  console.log(values);

  if (!doUpdate) {
    return;
  }

  await writeSecretToAllLocations(secretLocations, secretValue);

  const valuesAfter = await readSecretFromAllLocations(secretLocations);
  console.log("Secret values after:");
  console.log(valuesAfter);
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
Creates a new gateway secret and stores it on all the accounts where it is needed:
- Amplify control plane account
- All ComputeService cell accounts
- Integ test account  

This tool is intended to be used only during new region builds.

IT IS NOT SAFE TO RUN THIS TOOL ON A PROD REGION WHERE COMPUTE SERVICE IS GA
doing so would cause a few seconds of downtime. Although it can be used to reset secrets if you somehow already messed up secrets in prod.
`
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command. e.g. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("doUpdate", {
      describe:
        "perform the secret update. Otherwise just reads the secret from all accounts",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, doUpdate } = args;

  await unsafeResetSecret(stage as Stage, region as Region, doUpdate);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(JSON.stringify(e, null, 2));
    console.log(e);
  });
