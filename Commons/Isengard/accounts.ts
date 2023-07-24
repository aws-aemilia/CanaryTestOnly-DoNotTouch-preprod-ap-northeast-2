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

const getMeteringAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex =
    /^aws-amplify-metering-(?<stage>beta|gamma|preprod|prod)-(?<airportCode>[a-z]{3})@amazon.com$/;
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

const getDomainAccounts = async (): Promise<AmplifyAccount[]> => {
  // Get prod accounts
  const nameRegex =
    /^aws-mobile-aemilia-prod-(?<airportCode>[a-z]{3})-domain@amazon.com$/;
  const prodaAccounts: AccountListItem[] = await listIsengardAccounts();
  const airportCodes: string[] = [];

  const accounts = prodaAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    const { airportCode } = match.groups!;
    airportCodes.push(airportCode);

    return [
      {
        accountId: acc.AWSAccountID,
        email: acc.Email,
        airportCode,
        region: toRegionName(airportCode),
        stage: "prod",
      },
    ];
  });

  // Add non-prod accounts, we use the same one for all non-prod
  // stages and regions
  const stages = ["beta", "gamma", "preprod"];
  stages.forEach((stage) => {
    airportCodes.forEach((airportCode) => {
      accounts.push({
        accountId: "070306596019",
        email: "amplify-team-domains@amazon.com",
        airportCode,
        region: toRegionName(airportCode),
        stage,
      });
    });
  });

  return accounts;
};

const getUluruAccounts = async (): Promise<AmplifyAccount[]> => {
  const nameRegex = /^aws-amplify\+cfn\+(?<stage>beta|gamma|prod)-(?<airportCodeMessedUp>[a-z0-9]+)@amazon.com$/;
  const allAccounts: AccountListItem[] = await listIsengardAccounts();

  return allAccounts.flatMap((acc) => {
    const match = acc.Email.match(nameRegex);
    if (match === null) {
      return [];
    }

    // Airport code is messed up because it doesn't have the hyphens. For example the IAD
    // account uses this email: aws-amplify+cfn+prod+useast1@amazon.com, so the airport code
    // is `useast1` instead of `us-east-1` as it should be.
    const { airportCodeMessedUp, stage } = match.groups!;

    // Fix the airport code by inserting the hyphens and turn `useast1` into `us-east-1`.
    const airportCode = airportCodeMessedUp.replace(/([a-z]{2})([a-z]+)(\d{1})/, "$1-$2-$3");

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

export const uluruAccounts: AccountsLookupFn = defaultGetAccounts(
  getUluruAccounts,
  "uluruAccounts"
);

export const uluruAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getUluruAccounts,
  "uluruAccounts"
);

export const meteringAccounts: AccountsLookupFn = defaultGetAccounts(
    getMeteringAccounts,
    "meteringAccounts"
);

export const meteringAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getMeteringAccounts,
  "meteringAccounts"
);

export const domainAccounts: AccountsLookupFn = defaultGetAccounts(
    getDomainAccounts,
    "domainAccounts"
)

export const domainAccount: (
  stage: Stage,
  region: Region
) => Promise<AmplifyAccount> = defaultGetAccount(
  getDomainAccounts,
  "domainAccounts"
);

// The root account holds apex domains that delegate to regional Route53 hosted zones
export const rootDomainAccount = (): AmplifyAccount => {
  return {
    accountId: "673144583891",
    email: "aws-mobile-aemilia-domain@amazon.com",
    airportCode: "iad", // irrelevant
    region: "us-east-1", // irrelevant
    stage: "prod", // irrelevant
  };
};

export enum AmplifyAccountType {
  controlPlane = "controlPlane",
  integTest = "integTest",
  console = "console",
  computeServiceControlPlane = "computeServiceControlPlane",
  computeServiceDataPlane = "computeServiceDataPlane",
  dataPlane = "dataPlane",
  kinesisConsumer = "kinesisConsumer",
  metering = "metering",
  domain = "domain",
}

export const getAccountsLookupFn: Record<AmplifyAccountType, AccountsLookupFn> = {
  controlPlane: controlPlaneAccounts,
  integTest: integTestAccounts,
  console: consoleAccounts,
  computeServiceControlPlane: computeServiceControlPlaneAccounts,
  computeServiceDataPlane: computeServiceDataPlaneAccounts,
  dataPlane: dataPlaneAccounts,
  kinesisConsumer: kinesisConsumerAccounts,
  metering: meteringAccounts,
  domain: domainAccounts
};
