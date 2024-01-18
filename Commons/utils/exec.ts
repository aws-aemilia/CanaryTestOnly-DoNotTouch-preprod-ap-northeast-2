import { exec as execNonPromise, ExecException } from "child_process";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import util from "util";
import { ExecaChildProcess } from "execa";
import logger from "Commons/utils/logger";

const execAsync = util.promisify(execNonPromise);

export async function exec(
  command: string,
  credentials?: AwsCredentialIdentity
): Promise<{ stdout: string; stderr: string }> {
  const env = credentials && {
    AWS_ACCESS_KEY_ID: credentials.accessKeyId,
    AWS_SECRET_ACCESS_KEY: credentials.secretAccessKey,
    AWS_SESSION_TOKEN: credentials.sessionToken,
  };
  const { stdout, stderr } = await execAsync(command, { env });
  return { stdout, stderr };
}

export interface ExecError extends ExecException {
  stdout?: string;
  stderr?: string;
}

/**
 * Executes the given command with the given arguments in a spawned shell. Listens to the stdout and stderr streams and logs the output
 * to the console using the logger.
 *
 * @param command The command to execute
 * @param args The arguments to pass to the command
 */
export const executeCommand = async (command: string, args: string[]) => {
  const execa = await getExeca();
  const commandProcess = execa(command, args, {
    buffer: false,
  });

  attachProcessLoggingListeners(commandProcess);

  await commandProcess;
};

/**
 * Attaches logging listeners to the given command process.
 *
 * @param commandProcess The command process to attach the logging listeners to
 */
const attachProcessLoggingListeners = (commandProcess: ExecaChildProcess) => {
  const { stderr, stdout } = commandProcess;

  stdout?.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .forEach((line: string) => logger.info(line));
  });

  stderr?.on("data", (data) => {
    data
      .toString()
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line)
      .forEach((line: string) => logger.error(line));
  });
};

/**
 * Gets the execa module. This is needed because execa is an ESM module and cannot be imported using require.
 *
 * @returns The execa module
 */
const getExeca = async () => {
  const dynamicImport = new Function("specifier", "return import(specifier)");
  const { execa } = (await dynamicImport("execa")) as typeof import("execa");
  return execa;
};
