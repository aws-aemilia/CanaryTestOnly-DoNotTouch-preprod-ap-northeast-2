import { AmplifyAccount } from "../Isengard";

export type LambdaLimit = {
  lambdaLimitName: "Concurrent Limit" | "Code Storage Limit in GB";
  assignedFolder: string;
  ctiItem: string;
  assignedGroup: string,
  limitValueFn: (account: AmplifyAccount) => number;
};
/**
 * https://w.amazon.com/index.php/Lambda/Limits#Bot_FAQ_for_CS_People_2
 */
const maxCodeStorage = 300;

export const getMaxAllowedLambdaConcurrency = (account: AmplifyAccount) => {
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
export const getComputeCellLambdaConcurrency = () => {
  return 20000;
};

/**
 * If you ever need to update this, the easiest way to find the ticket specific values is to manually cut a ticket per
 * the instructions on https://w.amazon.com/index.php/Lambda/Limits and then inspect the resulting ticket json:
 * mcurl https://maxis-service-prod-iad.amazon.com/issues/${ticketId}
 */

export const maxLambdaConcurrencyLambdaLimit: LambdaLimit = {
  lambdaLimitName: 'Concurrent Limit',
  assignedFolder: '3db8bd55-220f-4189-a666-b67025eb1150',
  ctiItem: 'Limit Increase - Concurrent Executions',
  assignedGroup: 'AWS Lambda Concurrency Manager',
  limitValueFn: getMaxAllowedLambdaConcurrency
}

export const computeCellLambdaConcurrencyLambdaLimit: LambdaLimit = {
  lambdaLimitName: 'Concurrent Limit',
  assignedFolder: '3db8bd55-220f-4189-a666-b67025eb1150',
  ctiItem: 'Limit Increase - Concurrent Executions',
  assignedGroup: 'AWS Lambda Concurrency Manager',
  limitValueFn: getComputeCellLambdaConcurrency
}

export const maxCodeStorageLambdaLimit: LambdaLimit = {
  lambdaLimitName: 'Code Storage Limit in GB',
  assignedFolder: '1a173f03-866e-49fe-93dc-69b169de65cc',
  ctiItem: 'Limit Increase - Code Storage',
  assignedGroup: 'AWS Lambda CP Code Management',
  limitValueFn: () => maxCodeStorage
}
