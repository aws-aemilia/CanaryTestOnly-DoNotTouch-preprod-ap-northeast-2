import pLimit from "p-limit";
import sha256 from "crypto-js/sha256";
import {
  AmplifyAccount,
  computeServiceDataPlaneAccounts,
  controlPlaneAccount,
  integTestAccount,
  Region,
  Stage,
} from "../../../Isengard";
import { elbSecretStoreWithPriority } from "./secretStores/elb";
import { secretsManagerSecretStoreWithName } from "./secretStores/secretsManager";
import { Secret, SecretStore } from "./secretStores/types";
import { readSecret, writeSecret } from "./secretStores/lambdaEdgeConfig";
import yargs from "yargs";

export const newSecret = (): string => {
  const secretValue = sha256(new Date().toISOString());
  return secretValue.toString();
};

const getSecretLocations = async (
  stage: Stage,
  region: Region
): Promise<{ account: AmplifyAccount; secretStore: SecretStore }[]> => {
  return [
    // Compute service cell accounts stores 2 secrets in both Secrets Manager and in the ELB.
    ...(await computeServiceDataPlaneAccounts({ stage, region })).flatMap(
      (acc) => [
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName(
            "SharedGatewaySecretA"
          ),
        },
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName(
            "SharedGatewaySecretB"
          ),
        },
        { account: acc, secretStore: elbSecretStoreWithPriority("5") },
        { account: acc, secretStore: elbSecretStoreWithPriority("10") },
      ]
    ),
    // Control plane accounts store the secret in DDB on the LambdaEdgeConfig table
    {
      account: await controlPlaneAccount(stage, region),
      secretStore: {
        readSecret,
        writeSecret,
      },
    },
    // Integ test accounts account store the secret on Secrets Manager
    {
      account: await integTestAccount(stage, region),
      secretStore: secretsManagerSecretStoreWithName(
        "CellGatewayOriginVerifyHeader"
      ),
    },
  ];
};

const readSecretFromAllLocations = async (
  locations: { account: AmplifyAccount; secretStore: SecretStore }[]
): Promise<Secret[]> => {
  const readFns = locations.map(
    (l) => () => l.secretStore.readSecret(l.account)
  );
  // CFN is involved and we don't want throttles.
  const limit = pLimit(1);
  return await Promise.all(readFns.map(limit));
};

const writeSecretToAllLocations = async (
  locations: { account: AmplifyAccount; secretStore: SecretStore }[],
  secretValue: string
): Promise<void> => {
  const writeFns = locations.map(
    (l) => () => l.secretStore.writeSecret(l.account, secretValue)
  );
  // CFN is involved and we don't want throttles.
  const limit = pLimit(1);
  await Promise.all(writeFns.map(limit));
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
