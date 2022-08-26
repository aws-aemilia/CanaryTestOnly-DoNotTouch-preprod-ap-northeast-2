import { AccountListItem, listIsengardAccounts } from "@amzn/isengard";
import { toRegionName } from "../utils/regions";
import { withFileCache } from "./cache";
import { curry, pipe } from "ramda";
import { Region, Stage } from "./types";

export type AmplifyAccount = {
  accountId: string;
  email: string;
  airportCode: string;
  region: string;
  stage: string;
  cellNumber?: string;
};

export type AccountsLookupFn = (options?: {
  stage?: Stage;
  region?: Region;
}) => Promise<AmplifyAccount[]>;

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

    if (airportCode === 'kix') {
      // kix has not launched yet.
      return [];
    }

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode: stage === "beta" ? "pdx" : airportCode,
        region: stage === "beta" ? "us-west-2" : toRegionName(airportCode),
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
        region: toRegionName(airportCode),
        stage,
      },
    ];
  });
};

const getConsoleAccounts = async (): Promise<AmplifyAccount[]> => {
  const integTestNameRegex =
      /^aws-mobile-amplify-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})-console?@amazon.com$/;
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
        region: toRegionName(airportCode),
        stage,
      },
    ];
  });
};

const getComputeServiceControlPlaneAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex =
      /^(aws-amplify-|aws-mobile-amplify\+)compute-service-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegionName(airportCode),
        stage,
      },
    ];
  });
};

const getComputeServiceDataPlaneAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex =
      /^(aws-amplify-|aws-mobile-amplify\+)compute-service-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})-cell(?<cellNumber>\d+)@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage, cellNumber } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegionName(airportCode),
        stage,
        cellNumber
      },
    ];
  });
};

const getDataPlaneAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex =
      /^aws-mobile-amplify\+dataplane-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegionName(airportCode),
        stage,
      },
    ];
  });
};

const getKinesisConsumerAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex =
    /^aws-amplify-kinesis-(consumer|cnsmr)-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode, stage } = match.groups!;

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegionName(airportCode),
        stage,
      },
    ];
  });
}

const withFilterByRegionAndStage = (
  fn: () => Promise<AmplifyAccount[]>
): AccountsLookupFn => {
  return async ({ stage, region }: { stage?: Stage; region?: Region } = {}) => {
    return (await fn()).filter(
      (a) =>
        (region === undefined ||
          a.region === region ||
          a.airportCode.toUpperCase() === region.toUpperCase()) &&
        (stage === undefined || a.stage === stage)
    );
  };
};

const withFindByRegionAndStage = (
  fn: () => Promise<AmplifyAccount[]>
): ((stage: Stage, region: Region) => Promise<AmplifyAccount>) => {
  return async (stage: Stage, region: Region) => {
    const accs = await fn()
    const found: AmplifyAccount | undefined = (accs).find(
      (a) =>
        a.stage === stage &&
        (a.region === region ||
          a.airportCode.toUpperCase() === region.toUpperCase())
    );
    if (found === undefined) {
      throw new Error(
        `Could not find account for stage,region = ${stage},${region}. Account set was ${accs.map(x=>x.email)}`
      );
    }
    return found;
  };
};

const withFindByRegionAndStageAndCell = (
  fn: () => Promise<AmplifyAccount[]>
): ((
  stage: Stage,
  region: Region,
  cellNumber: number
) => Promise<AmplifyAccount>) => {
  return async (stage: Stage, region: Region, cellNumber: number) => {
    const found: AmplifyAccount | undefined = (await fn()).find(
      (a) =>
        a.stage === stage &&
        (a.region === region ||
          a.airportCode.toUpperCase() === region.toUpperCase()) &&
        a.cellNumber === cellNumber.toString()
    );
    if (found === undefined) {
      throw new Error(
        `Could not find account for stage,region = ${stage},${region}`
      );
    }
    return found;
  };
};

const defaultGetAccounts = (
  fn: () => Promise<AmplifyAccount[]>,
  cacheKey: string
): AccountsLookupFn => {
  return pipe(
    () => fn,
    curry(withFileCache)(cacheKey),
    withFilterByRegionAndStage
  )();
};

const defaultGetAccount = (
  fn: () => Promise<AmplifyAccount[]>,
  cacheKey: string
): ((stage: Stage, region: Region) => Promise<AmplifyAccount>) => {
  return pipe(
    () => fn,
    curry(withFileCache)(cacheKey),
    withFindByRegionAndStage
  )();
};

export const controlPlaneAccounts: AccountsLookupFn = defaultGetAccounts(
  getControlPlaneAccounts,
  "controlPlaneAccounts"
);
export const controlPlaneAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getControlPlaneAccounts,
  "controlPlaneAccounts"
);

export const integTestAccounts: AccountsLookupFn = defaultGetAccounts(
  getIntegTestAccounts,
  "integTestAccounts"
);
export const integTestAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getIntegTestAccounts,
  "integTestAccounts"
);

export const consoleAccounts: AccountsLookupFn = defaultGetAccounts(
  getConsoleAccounts,
  "consoleAccounts"
);
export const consoleAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getConsoleAccounts,
  "consoleAccounts"
);

export const computeServiceControlPlaneAccounts: AccountsLookupFn = defaultGetAccounts(
  getComputeServiceControlPlaneAccounts,
  "computeServiceControlPlaneAccounts"
);
export const computeServiceControlPlaneAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getComputeServiceControlPlaneAccounts,
  "computeServiceControlPlaneAccounts"
);

export const computeServiceDataPlaneAccounts: AccountsLookupFn = defaultGetAccounts(
  getComputeServiceDataPlaneAccounts,
  "computeServiceDataPlaneAccounts"
);

export const computeServiceDataPlaneAccount: (stage: Stage, region: Region, cellNumber: number) => Promise<AmplifyAccount> = pipe(
    () => getComputeServiceDataPlaneAccounts,
    curry(withFileCache)('computeServiceDataPlaneAccounts'),
    withFindByRegionAndStageAndCell
)()

export const dataPlaneAccounts: AccountsLookupFn = defaultGetAccounts(
    getDataPlaneAccounts,
    "dataPlaneAccounts"
);
export const dataPlaneAccount: (
    stage: Stage,
    region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
    getDataPlaneAccounts,
    "dataPlaneAccounts"
);

export const kinesisConsumerAccounts: AccountsLookupFn = defaultGetAccounts(
  getKinesisConsumerAccounts,
  "kinesisConsumerAccounts"
);
export const kinesisConsumerAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getKinesisConsumerAccounts,
  "kinesisConsumerAccounts"
);
