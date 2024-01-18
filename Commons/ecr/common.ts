import {
  ECR,
  ListImagesCommand,
  ListImagesCommandOutput,
} from "@aws-sdk/client-ecr";

/**
 * List all of the image IDs for the given repository.
 *
 * @param ecr The ECR client
 * @param repositoryName The name of the repository to list the image IDs for
 * @returns A list of image IDs for the given repository
 */
export const listTaggedImageIds = async (ecr: ECR, repositoryName: string) => {
  const imageIds = [];

  let nextToken;

  do {
    const result: ListImagesCommandOutput = await ecr.listImages({
      repositoryName: repositoryName,
      filter: {
        tagStatus: "TAGGED",
      },
      nextToken: nextToken,
    });

    if (result.imageIds) {
      imageIds.push(...result.imageIds);
    }

    nextToken = result.nextToken;
  } while (nextToken);

  return imageIds;
};

/**
 * Get the ECR Docker login password for the given account ID.
 *
 * @param ecr The ECR client
 * @param accountId The account ID to get the ECR Docker login password for
 * @returns The ECR Docker login password for the given account ID
 */
export const getLoginPassword = async (ecr: ECR, accountId: string) => {
  const result = await ecr.getAuthorizationToken({
    registryIds: [accountId],
  });

  if (!result.authorizationData || result.authorizationData.length == 0) {
    throw new Error("Failed to get authorization data from ECR");
  }

  const { authorizationToken } = result.authorizationData[0];

  if (!authorizationToken) {
    throw new Error("Failed to get authorization token from ECR");
  }

  const ecrCredentials = Buffer.from(authorizationToken, "base64").toString();

  const ecrLoginPassword = ecrCredentials.split(":")[1];

  if (!ecrLoginPassword) {
    throw new Error("Failed to get ECR login password.");
  }

  return ecrLoginPassword;
};

/**
 * Get the ECR registry URL for the given account ID and region.
 *
 * @param accountId The account ID to get the registry URL for
 * @param region The region to get the registry URL for
 * @returns The ECR registry URL for the given account ID and region
 */
export const getECRRegistryUrl = (accountId: string, region: string) => {
  return `${accountId}.dkr.ecr.${region}.amazonaws.com`;
};
