import { AmplifyAccount } from "../../../../commons/Isengard";

export type Secret = {
  value?: string;
  /**
   * Human readable string that indicates where the secret is located. May include AWS account email, ARN of the AWS resource, etc.
   */
  meta?: string;
};

export type readSecretFn = (account: AmplifyAccount) => Promise<Secret>;

export type writeSecretFn = (
  account: AmplifyAccount,
  secretValue: string
) => Promise<void>;

export type SecretStore = {
  readSecret: readSecretFn;
  writeSecret: writeSecretFn;
};
