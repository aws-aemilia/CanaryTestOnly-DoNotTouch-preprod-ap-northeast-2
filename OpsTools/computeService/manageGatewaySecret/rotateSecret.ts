import { Region, Stage } from "../../../Commons/Isengard";
import { Secret } from "./secretStores/types";
import sleep from "../../../Commons/utils/sleep";
import {
  newSecret,
  readSecretFromAllLocations,
  writeSecretToAllLocations,
} from "./utils/utils";
import yargs from "yargs";
import {
  getNamedSecretLocations,
  NamedSecretLocations,
} from "./secretStores/secretLocations";

const checkPreRequisites = async (
  namedSecretLocations: NamedSecretLocations
) => {
  const {
    edgeLambda,
    integTest,
    hostingDataplaneIntegTest,
    gatewayA,
    gatewayB,
  } = namedSecretLocations;
  const others = [integTest, hostingDataplaneIntegTest, ...gatewayB];

  const edgeLambdaSecret = await edgeLambda.secretStore.readSecret(
    edgeLambda.account
  );
  const otherSecrets: Secret[] = await readSecretFromAllLocations(others);

  const gatewayASecrets = await readSecretFromAllLocations(gatewayA);

  const gatewayASecretsValueSet = gatewayASecrets.reduce(
    (secretsSet, secretLocation) => secretsSet.add(secretLocation.value),
    new Set() as Set<string | undefined>
  );

  if (gatewayASecretsValueSet.size > 1) {
    console.warn(
      "WARNING: there are different gateway A secrets among cells. Some cells may be experiencing an outage. The rotation will fix it"
    );
  }

  if (!gatewayASecretsValueSet.has(edgeLambdaSecret.value)) {
    console.warn(
      "SEVERE WARNING: none of the gateway A secrets match the EdgeLambda secret. This means a complete outage. The rotation will fix it"
    );
  }

  const otherSecretsValueSet = otherSecrets.reduce(
    (secretsSet, secretLocation) => secretsSet.add(secretLocation.value),
    new Set() as Set<string | undefined>
  );

  if (
    !otherSecretsValueSet.has(edgeLambdaSecret.value) ||
    otherSecretsValueSet.size !== 1
  ) {
    console.warn(
      `WARNING: Either the integ tests or gateway B secrets do not match the EdgeLambda secret. Maybe you interrupted a secret rotation or somehow messed up integ test accounts. The rotation will fix it`
    );
  }
};

const rotateSecret = async (namedSecretLocations: NamedSecretLocations) => {
  const {
    edgeLambda,
    integTest,
    hostingDataplaneIntegTest,
    gatewayA,
    gatewayB,
  } = namedSecretLocations;

  const edgeLambdaSecret = await edgeLambda.secretStore.readSecret(
    edgeLambda.account
  );

  console.log(`\nEdgeLambda secret:`, edgeLambdaSecret.value);
  const newSecretValue = newSecret();
  console.log(`New secret:`, newSecretValue);

  console.log("\nWriting new secret to the gateway on slot B");
  await writeSecretToAllLocations(gatewayB, newSecretValue);

  console.log("Secrets in gateway are:");
  console.log(await readSecretFromAllLocations([...gatewayA, ...gatewayB]));

  console.log("Waiting 30 seconds...");
  await sleep(30_000);

  console.log("Writing new secret to EdgeLambda and integ test locations");
  await edgeLambda.secretStore.writeSecret(edgeLambda.account, newSecretValue);
  await integTest.secretStore.writeSecret(integTest.account, newSecretValue);
  await hostingDataplaneIntegTest.secretStore.writeSecret(
    hostingDataplaneIntegTest.account,
    newSecretValue
  );

  console.log(
    "Waiting 30 seconds to allow inflight SSR request that used the old secret to complete..."
  );
  await sleep(30_000);

  console.log(
    "Writing new secret to gateway on slot A. This effectively deactivates the old secret"
  );

  await writeSecretToAllLocations(gatewayA, newSecretValue);

  console.log("\nSUCCESS\n");
  console.log("Updated secrets:");
  console.log(
    await readSecretFromAllLocations([
      edgeLambda,
      ...gatewayA,
      ...gatewayB,
      integTest,
      hostingDataplaneIntegTest,
    ])
  );
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
Safely rotates the gateway secret on all the accounts where it is needed:
- Amplify control plane account
- All ComputeService cell accounts
- Integ test account  

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
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  const namedSecretLocations = await getNamedSecretLocations(
    stage as Stage,
    region as Region
  );

  await checkPreRequisites(namedSecretLocations);
  await rotateSecret(namedSecretLocations);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(JSON.stringify(e, null, 2));
    console.log(e);
  });
