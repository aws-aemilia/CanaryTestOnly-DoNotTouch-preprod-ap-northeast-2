import { AccountListItem, listIsengardAccounts } from "@amzn/isengard";
import { toRegion } from "../utils/regions";
import { withFileCache } from "./cache";

export type AmplifyAccount = {
  accountId: string;
  email: string;
  airportCode: string;
  region: string;
  stage: string;
};
const getControlPlaneAccounts = async (): Promise<AmplifyAccount[]> => {
  const controlPlaneNameRegex =
    /^aws-mobile-aemilia-(?<stage>beta|gamma|preprod|prod)(-(?<airportCode>[a-z]{3}))?@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(controlPlaneNameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: stage === "beta" ? "us-west-2" : toRegion(airportCode),
        stage,
      },
    ];
  });
};

const getIntegTestAccounts = async (): Promise<AmplifyAccount[]> => {
  const integTestNameRegex =
      /^aws-(aemilia|ameilia)-integration-test-(?<airportCode>[a-z]{3})-(?<stage>beta|gamma|preprod|prod)?@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(integTestNameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegion(airportCode),
        stage,
      },
    ];
  });
};

/**
 * get Control Plane accounts for all regions and stages
 */
export async function controlPlaneAccounts(): Promise<AmplifyAccount[]> {
  return withFileCache(getControlPlaneAccounts, "controlPlaneAccounts")();
}

/**
 * get Integration Tests accounts for all regions and stages
 */
export async function integTestAccounts(): Promise<AmplifyAccount[]> {
  return withFileCache(getIntegTestAccounts, "integTestAccounts")();
}