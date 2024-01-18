import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";
import { toRegionName } from "../../Commons/utils/regions";
import confirm from "Commons/utils/confirm";
import { ECR } from "@aws-sdk/client-ecr";
import {
  dockerLogin,
  dockerLogout,
  dockerPullImage,
  dockerPushImage,
  dockerRemoveImage,
  dockerTagImage,
  getECRRegistryUrl,
  getLoginPassword,
  isDockerInstalled,
  listTaggedImageIds,
} from "Commons/ecr";
import logger from "Commons/utils/logger";

const ECR_REPOSITORY_NAME = "aemilia-build-image";

async function getArgs() {
  return await yargs(hideBin(process.argv))
    .usage(
      `
      Tag the managed build image with the given tag. This is useful for tagging the build image with a custom tag or 
      for changing the default tag of the image.

      This tool requires that you have the docker CLI installed.

      Example:
      # Tag the image with given digest with the al2 tag.
      npx ts-node addECRImageTag.ts \
        --stage beta \
        --region pdx \
        --digest sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef \
        --tag al2
    `
    )
    .option("stage", {
      describe: `The stage that the ECR repository is in (e.g. prod, beta, gamma).`,
      type: "string",
      default: "prod",
      alias: "s",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: `The region that the ECR repository is in (e.g. pdx, PDX, us-west-2).`,
      type: "string",
      demandOption: true,
      alias: "r",
    })
    .option("digest", {
      describe: `The digest of the image to tag (e.g. sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef).`,
      type: "string",
      demandOption: true,
      alias: "d",
    })
    .option("tag", {
      describe: `The tag to add to the image (e.g. al2).`,
      type: "string",
      demandOption: true,
      alias: "t",
    })
    .strict()
    .version(false)
    .help().argv;
}

async function main() {
  const { stage, region, digest, tag } = await getArgs();

  if (!(await isDockerInstalled())) {
    throw new Error(
      "Docker is not installed. Please install Docker and try again."
    );
  }

  const regionName = toRegionName(region);

  const controlPlaneAccount_ = await controlPlaneAccount(
    stage as Stage,
    regionName
  );

  await preflightCAZ({
    accounts: [controlPlaneAccount_],
    role: "ECRPutImageRole",
  });

  const ecr = new ECR({
    region: regionName,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount_.accountId,
      "ECRPutImageRole"
    ),
  });

  const imageIds = await listTaggedImageIds(ecr, ECR_REPOSITORY_NAME);

  logger.info(
    `Found ${imageIds.length} image identifiers in the ${ECR_REPOSITORY_NAME} repository.`
  );

  logger.info(`Checking if an image with the digest ${digest} exists...`);

  const imageWithGivenDigest = imageIds.find(
    (imageId) => imageId.imageDigest === digest
  );

  if (!imageWithGivenDigest) {
    throw new Error(
      `An image with the digest ${digest} does not exist. Please check the digest and try again.`
    );
  }

  logger.info(`Image with the digest ${digest} exists. Continuing...`);

  const { accountId } = controlPlaneAccount_;

  const registryUrl = getECRRegistryUrl(accountId, regionName);
  const repositoryName = `${registryUrl}/${ECR_REPOSITORY_NAME}`;

  if (
    await confirm(
      `Are you sure you want to tag ${repositoryName}@${digest} with ${tag}?`
    )
  ) {
    const ecrLoginPassword = await getLoginPassword(ecr, accountId);

    if (!ecrLoginPassword) {
      throw new Error("Failed to get ECR login password.");
    }

    await dockerLogin(registryUrl, ecrLoginPassword);
    await dockerPullImage(repositoryName, digest);
    await dockerTagImage(repositoryName, digest, tag);
    await dockerPushImage(repositoryName, tag);

    logger.info(`Successfully tagged ${repositoryName}@${digest} with ${tag}.`);

    logger.info(`Removing the image from the local Docker repository...`);

    await dockerRemoveImage(repositoryName, tag);

    logger.info(
      `Successfully removed ${repositoryName}:${tag} from the local Docker repository.`
    );

    logger.info(`Logging out of the ECR repository...`);

    await dockerLogout(registryUrl);

    logger.info(`Successfully logged out of the ECR repository.`);
  }
}

main().catch((e) => logger.error(e.message));
