import { AmplifyAccount } from "../../../../Isengard";
import { Secret, SecretStore } from "../secretStores/types";
import pLimit from "p-limit";
import { randomBytes } from "crypto";

/**
 * Creates a random secret string.
 * Cannot exceed 128 characters so that it fits in ELB rules
 */
export const newSecret = (): string => {
  return randomBytes(64).toString("base64");
};

export const readSecretFromAllLocations = async (
  locations: { account: AmplifyAccount; secretStore: SecretStore }[]
): Promise<Secret[]> => {
  const readFns = locations.map(
    (l) => () => l.secretStore.readSecret(l.account)
  );
  // CFN is involved and we don't want throttles.
  const limit = pLimit(1);
  return await Promise.all(readFns.map(limit));
};

export const writeSecretToAllLocations = async (
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
