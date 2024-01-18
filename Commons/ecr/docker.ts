import { executeCommand } from "Commons/utils/exec";
import logger from "Commons/utils/logger";

/**
 * Pulls the image with the given digest from the ECR repository with the given name.
 *
 * @param repositoryName The name of the ECR repository
 * @param digest The digest of the image to pull
 */
export const dockerPullImage = async (
  repositoryName: string,
  digest: string
) => {
  const command = `docker`;
  const args = ["pull", `${repositoryName}@${digest}`];

  logger.info(`Pulling image with command: ${command} ${args.join(" ")}`);

  await executeCommand(command, args);
};

/**
 * Tags the image with the given digest with the given tag.
 *
 * @param repositoryName The name of the ECR repository
 * @param digest The digest of the image to tag
 * @param tag The tag to apply to the image
 */
export const dockerTagImage = async (
  repositoryName: string,
  digest: string,
  tag: string
) => {
  const command = `docker`;
  const args = [
    "tag",
    `${repositoryName}@${digest}`,
    `${repositoryName}:${tag}`,
  ];

  logger.info(`Tagging image with command: ${command} ${args.join(" ")}`);

  await executeCommand(command, args);
};

/**
 * Pushes the image with the given tag to the ECR repository with the given name.
 *
 * @param repositoryName The name of the ECR repository
 * @param tag The tag of the image to push
 */
export const dockerPushImage = async (repositoryName: string, tag: string) => {
  const command = `docker`;
  const args = ["push", `${repositoryName}:${tag}`];

  logger.info(`Pushing image with command: ${command} ${args.join(" ")}`);

  await executeCommand(command, args);
};

/**
 * Removes the image from the local Docker repository.
 *
 * @param repositoryName The name of the repository
 * @param tag The tag of the image to remove
 */
export const dockerRemoveImage = async (
  repositoryName: string,
  tag: string
) => {
  const command = `docker`;
  const args = ["rmi", `${repositoryName}:${tag}`];

  logger.info(`Removing image with command: ${command} ${args.join(" ")}`);

  await executeCommand(command, args);
};

/**
 * Logs into the ECR repository with the given registry URL using the given login password.
 *
 * @param registryUrl The registry URL of the ECR repository
 * @param ecrLoginPassword The login password for the ECR repository
 */
export const dockerLogin = async (
  registryUrl: string,
  ecrLoginPassword: string
) => {
  const loginCommand = `docker login --username AWS --password-stdin ${registryUrl}`;

  logger.info(`Logging into ECR with command: ${loginCommand}`);

  const command = `sh`;
  const args = ["-c", `echo "${ecrLoginPassword}" | ${loginCommand}`];

  await executeCommand(command, args);
};

/**
 * Logs out of the ECR repository with the given registry URL.
 *
 * @param registryUrl The registry URL of the ECR repository
 */
export const dockerLogout = async (registryUrl: string) => {
  const command = `docker`;
  const args = ["logout", registryUrl];

  await executeCommand(command, args);
};

/**
 * Checks if Docker is installed on the machine.
 *
 * @returns Whether or not Docker is installed
 */
export const isDockerInstalled = async () => {
  const command = `docker`;
  const args = ["--version"];

  try {
    await executeCommand(command, args);
    return true;
  } catch (error) {
    return false;
  }
};
