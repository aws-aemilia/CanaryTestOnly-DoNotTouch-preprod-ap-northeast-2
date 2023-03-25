import { exec as execNonPromise } from "child_process";
import util from "util";

const execAsync = util.promisify(execNonPromise);

export async function exec(
  command: string
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command);
    return { stdout, stderr };
  } catch (e) {
    console.log(`Failed to run command: ${command}`);
    throw e;
  }
}
