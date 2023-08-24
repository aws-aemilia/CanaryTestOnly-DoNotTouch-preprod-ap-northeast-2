import { AmplifyAccount } from "../Isengard";
import { createCategorization, TicketyService } from "./Tickety";
import { TicketData } from "@amzn/tickety-typescript-sdk";

export type LambdaLimit = {
  lambdaLimitName: "Concurrent Limit" | "Code Storage Limit in GB";
  ctiItem: string;
  limitValueFn: (account: AmplifyAccount) => number;
};
/**
 * https://w.amazon.com/index.php/Lambda/Limits#Bot_FAQ_for_CS_People_2
 */
const maxCodeStorage = 300;
const ticketyService = new TicketyService();

const getMaxAllowedLambdaConcurrency = (account: AmplifyAccount) => {
  /**
   * https://code.amazon.com/packages/LambdaOperationalToolsGo/blobs/173374362773ed241aad1cf13cc8afa833832923/--/cli/rho/concurrency/limits/limits.go#L19
   */
  const bigRegionlambdaLimits: Record<string, number> = {
    "us-east-1": 20000,
    "eu-west-1": 10000,
    "ap-northeast-1": 10000,
    "us-west-2": 10000,
    "ap-southeast-2": 5000,
    "eu-central-1": 5000,
    "us-east-2": 5000,
  };

  /**
   * https://code.amazon.com/packages/LambdaOperationalToolsGo/blobs/173374362773ed241aad1cf13cc8afa833832923/--/cli/rho/concurrency/limits/limits.go#L10
   */
  const defaultLimit = 2500;

  if (bigRegionlambdaLimits[account.region] !== undefined) {
    return bigRegionlambdaLimits[account.region];
  }
  return defaultLimit;
};

/**
 * The 20k limit needs Lambda PM approval. See: https://t.corp.amazon.com/P88254262/communication
 */
const getComputeCellLambdaConcurrency = () => {
  return 20000;
};

const maxLambdaConcurrencyLambdaLimit: LambdaLimit = {
  lambdaLimitName: "Concurrent Limit",
  ctiItem: "Limit Increase - Concurrent Executions",
  limitValueFn: getMaxAllowedLambdaConcurrency,
};

const computeCellLambdaConcurrencyLambdaLimit: LambdaLimit = {
  lambdaLimitName: "Concurrent Limit",
  ctiItem: "Limit Increase - Concurrent Executions",
  limitValueFn: getComputeCellLambdaConcurrency,
};

const maxCodeStorageLambdaLimit: LambdaLimit = {
  lambdaLimitName: "Code Storage Limit in GB",
  ctiItem: "Limit Increase - Code Storage",
  limitValueFn: () => maxCodeStorage,
};

/**
 * Cuts a ticket to Lambda requesting a Limit increase. The ticket will be resolved automatically by a bot.
 * See: https://w.amazon.com/index.php/Lambda/Limits
 */
const createLambdaLimitIncreaseTicket = async (
  lambdaLimit: LambdaLimit,
  account: AmplifyAccount
): Promise<string> => {
  const ticketData: TicketData = {
    title: `Lambda limit increase for Amplify Hosting - ${account.accountId}`,
    description: `BOT PROCESS\nAWS ID: ${account.accountId}\nRequested ${
      lambdaLimit.lambdaLimitName
    }: ${lambdaLimit.limitValueFn(
      account
    )} \nRegion: ${account.airportCode.toUpperCase()}`,
    severity: "SEV_3",
    categorization: createCategorization("AWS", "Lambda", lambdaLimit.ctiItem),
  };

  const output = await ticketyService.createTicket(ticketData);
  if (output.id) {
    return output.id;
  } else {
    throw new Error(`Unexpected response from Tickety: ${output}`);
  }
};

export const requestMaxLambdaConcurrency = createLambdaLimitIncreaseTicket.bind(
  null,
  maxLambdaConcurrencyLambdaLimit
);
export const requestComputeCellLambdaConcurrency =
  createLambdaLimitIncreaseTicket.bind(
    null,
    computeCellLambdaConcurrencyLambdaLimit
  );
export const requestMaxLambdaStorage = createLambdaLimitIncreaseTicket.bind(
  null,
  maxCodeStorageLambdaLimit
);
