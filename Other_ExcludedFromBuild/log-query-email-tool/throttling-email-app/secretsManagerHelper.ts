import SecretsManager, { GetSecretValueResponse } from "aws-sdk/clients/secretsmanager";

export const getWebhookSecret = async (secretName: string, secretsmanager: SecretsManager): Promise<GetSecretValueResponse> => {
    return await secretsmanager.getSecretValue({ SecretId: secretName }).promise();
}