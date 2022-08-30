import { kinesisAccounts } from "../utils";
import Isengard from "../utils/isengardCreds";

export const getArgs = () => {
  let args = process.argv;
  args = args.splice(2);

  if (!Array.isArray(args) || args.length < 1) {
    throw new Error("Invalid flags provided");
  }

  return args;
};

export const getArg = (argName: string, args: string[]) => {
  const argString = args.find((arg) => arg.includes(`--${argName}`));

  if (!argString) {
    throw new Error(`${argName} flag not provided`);
  }

  const argParts = argString.split(`--${argName}=`);

  if (!Array.isArray(argParts) || argParts.length !== 2) {
    throw new Error(`${argName} flag malformed`);
  }

  const arg = argParts[1];

  if (!arg) {
    throw new Error(`${argName} not provided`);
  }

  return arg;
};

export const getRegion = (args: string[]) => {
  const region = getArg("region", args);

  if (!kinesisAccounts.some((account) => account.region === region)) {
    throw new Error(`Invalid region provided: ${region}`);
  }

  return region;
};

export const getKinesisAccount = (region: string) => {
  const account = kinesisAccounts.find((account) => account.region === region);

  if (!account) {
    throw new Error(`Account not found for region: ${region}`);
  }

  return account;
};

export const getCredentials = async (accountId: string) => {
  const roleName = "ReadOnly";
  const credentials = await Isengard.getCredentials(accountId, roleName);

  if (!credentials) {
    throw new Error("Failed to get isengard creds");
  }

  return credentials;
};
