import {
  AmplifyAccount,
  controlPlaneAccount,
  dataPlaneAccounts,
  integTestAccount,
  Region,
  Stage,
} from "../../../../Isengard";
import { ddbLambdaEdgeConfigSecretStore } from "./lambdaEdgeConfig";
import { secretsManagerSecretStoreWithName } from "./secretsManager";
import { elbSecretStoreWithPriority } from "./elb";
import { SecretStore } from "./types";

type SecretLocation = { account: AmplifyAccount; secretStore: SecretStore };
export type NamedSecretLocations = {
  edgeLambda: SecretLocation;
  integTest: SecretLocation;
  gatewayA: SecretLocation[];
  gatewayB: SecretLocation[];
};

/**
 * Compute service gamma uses preprod control plane and integ test accounts when there is no corresponding gamma account.
 */
const locateAccountWithGammaSpecialCase = async (
  fn: (stage: Stage, region: Region) => Promise<AmplifyAccount>,
  stage: Stage,
  region: Region
): Promise<AmplifyAccount> => {
  if (stage !== "gamma") {
    return fn(stage, region);
  } else {
    try {
      return await fn(stage, region);
    } catch (e) {
      // nothing to do
    }
    return fn("preprod", region);
  }
};

export const getNamedSecretLocations = async (
  stage: Stage,
  region: Region
): Promise<NamedSecretLocations> => ({
  edgeLambda: {
    account: await locateAccountWithGammaSpecialCase(controlPlaneAccount, stage, region),
    secretStore: ddbLambdaEdgeConfigSecretStore,
  },
  ... await getComputeServiceOnlyNamedSecretLocations(stage, region)
});


export const getComputeServiceOnlyNamedSecretLocations = async (
    stage: Stage,
    region: Region
): Promise<Pick<NamedSecretLocations, 'gatewayA'|'gatewayB'|'integTest'>> => ({
  gatewayA: (await dataPlaneAccounts({ stage, region })).flatMap(
      (acc) => [
        { account: acc, secretStore: elbSecretStoreWithPriority("5") },
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName("SharedGatewaySecretA"),
        },
      ]
  ),
  gatewayB: (await dataPlaneAccounts({ stage, region })).flatMap(
      (acc) => [
        { account: acc, secretStore: elbSecretStoreWithPriority("10") },
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName("SharedGatewaySecretB"),
        },
      ]
  ),
  integTest: {
    account: await locateAccountWithGammaSpecialCase(integTestAccount, stage, region),
    secretStore: secretsManagerSecretStoreWithName(
        "CellGatewayOriginVerifyHeader"
    ),
  },
});
