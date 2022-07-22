import {
  AmplifyAccount,
  computeServiceDataPlaneAccounts,
  controlPlaneAccount,
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
export const getNamedSecretLocations = async (
  stage: Stage,
  region: Region
): Promise<NamedSecretLocations> => ({
  edgeLambda: {
    account: await controlPlaneAccount(stage, region),
    secretStore: ddbLambdaEdgeConfigSecretStore,
  },
  integTest: {
    account: await integTestAccount(stage, region),
    secretStore: secretsManagerSecretStoreWithName(
      "CellGatewayOriginVerifyHeader"
    ),
  },
  ... await getComputeServiceOnlyNamedSecretLocations(stage, region)
});


export const getComputeServiceOnlyNamedSecretLocations = async (
    stage: Stage,
    region: Region
): Promise<Pick<NamedSecretLocations, 'gatewayA'|'gatewayB'>> => ({
  gatewayA: (await computeServiceDataPlaneAccounts({ stage, region })).flatMap(
      (acc) => [
        { account: acc, secretStore: elbSecretStoreWithPriority("5") },
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName("SharedGatewaySecretA"),
        },
      ]
  ),
  gatewayB: (await computeServiceDataPlaneAccounts({ stage, region })).flatMap(
      (acc) => [
        { account: acc, secretStore: elbSecretStoreWithPriority("10") },
        {
          account: acc,
          secretStore: secretsManagerSecretStoreWithName("SharedGatewaySecretB"),
        },
      ]
  ),
});
