import { exec as execNonPromise, ExecException } from "child_process";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import util from "util";

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
