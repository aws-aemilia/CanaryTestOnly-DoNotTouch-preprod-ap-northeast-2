import {
  GetSecretValueCommand,
  SecretsManagerClient,
  UpdateSecretCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
} from "../../../../Isengard";
import { SecretStore } from "./types";
import { partial } from "ramda";

new SecretsManagerClient({});

const readSecret = async (secretName: string, account: AmplifyAccount) => {
  const secretsManagerClient = new SecretsManagerClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });
  const getSecretValueCommandOutput = await secretsManagerClient.send(
    new GetSecretValueCommand({ SecretId: secretName })
  );
  return {
    value: getSecretValueCommandOutput.SecretString!,
    meta: `${account.email} - Secrets manager ${getSecretValueCommandOutput.ARN}`,
  };
};
const writeSecret = async (
  secretName: string,
  account: AmplifyAccount,
  secretValue: string
) => {
  console.log(
    `Writing secret to SecretsManager ${secretName} at ${account.region}:${account.accountId}`
  );
  const secretsManagerClient = new SecretsManagerClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });
  await secretsManagerClient.send(
    new UpdateSecretCommand({
      SecretId: secretName,
      SecretString: secretValue,
    })
  );
};
export const secretsManagerSecretStoreWithName = (
  secretName: string
): SecretStore => ({
  readSecret: partial(readSecret, [secretName]),
  writeSecret: partial(writeSecret, [secretName]),
});
