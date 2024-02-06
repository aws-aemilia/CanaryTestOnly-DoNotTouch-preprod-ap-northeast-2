import {
  Stage,
  controlPlaneAccounts,
  integTestAccounts,
  aesIntegTestAccounts,
  computeServiceControlPlaneAccounts,
  computeServiceDataPlaneAccounts,
  dataPlaneAccounts,
  kinesisConsumerAccounts,
  uluruAccounts,
  meteringAccounts,
  domainAccounts,
} from "Commons/Isengard";

/**
 * Returns a set of all internal accounts.
 *
 * @param stage The stage to get the accounts for.
 * @returns A set of account IDs.
 */
export const getInternalAccountIds = async (stage: Stage) => {
  return new Set([
    ...(await controlPlaneAccounts({ stage })).map((acc) => acc.accountId),
    ...(await integTestAccounts({ stage })).map((acc) => acc.accountId),
    ...(await aesIntegTestAccounts({ stage })).map((acc) => acc.accountId),
    ...(await computeServiceControlPlaneAccounts({ stage })).map(
      (acc) => acc.accountId
    ),
    ...(await computeServiceDataPlaneAccounts({ stage })).map(
      (acc) => acc.accountId
    ),
    ...(await dataPlaneAccounts({ stage })).map((acc) => acc.accountId),
    ...(await kinesisConsumerAccounts({ stage })).map((acc) => acc.accountId),
    ...(await uluruAccounts({ stage })).map((acc) => acc.accountId),
    ...(await meteringAccounts({ stage })).map((acc) => acc.accountId),
    ...(await domainAccounts({ stage })).map((acc) => acc.accountId),
  ]);
};
