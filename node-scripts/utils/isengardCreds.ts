import { exec } from "child_process";
import { Credentials } from "../types";

/**
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 * THIS FILE IS DEPRECATED!!!!
 *
 * PLEASE USE THIS INSTEAD:
 *
 * import { getIsengardCredentialsProvider } from "../Isengard";
 */

interface StdIoResp {
  stdout: string;
  stderr: string;
}

interface CommandArgs {
  cmd: string;
  rejectOnStderr?: boolean;
  cwd?: string;
}

async function runCmd({
  cmd,
  rejectOnStderr = true,
  cwd = __dirname,
}: CommandArgs): Promise<StdIoResp> {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { cwd, maxBuffer: 1024 * 1024 },
      function (error: any, stdout: string, stderr: string) {
        if (error) {
          return reject(
            new Error(
              'Unable to obtain userid from Midway cookie. Have you run "mwinit"?' +
                error
            )
          );
        }
        if (rejectOnStderr && stderr) {
          // console.error(stderr)
          return reject(
            new Error(
              'Rejecting runCmd due to stderr. If you wish to ignore stderr, set "rejectOnStderr" to false.'
            )
          );
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

async function getCredentials(
  accountId: string,
  roleName = "ReadOnly"
): Promise<Credentials> {
  const params = {
    AWSAccountID: accountId,
    IAMRoleName: roleName,
  };

  const cmd = `
      curl -b ~/.midway/cookie \
      -c ~/.midway/cookie \
      -L -X POST \
      --header "X-Amz-Target: IsengardService.GetAssumeRoleCredentials" --header "Content-Encoding: amz-1.0" \
      --header "Content-Type: application/json; charset=UTF-8" -d '${JSON.stringify(
        params
      )}' \
      https://isengard-service.amazon.com`;

  const { stdout } = await runCmd({ cmd, rejectOnStderr: false });
  const res = JSON.parse(stdout);

  if (res.status === "error" || !res.AssumeRoleResult) {
    throw new Error(res.desc);
  }

  const assumeRole = JSON.parse(res.AssumeRoleResult);
  return assumeRole.credentials;
}

export default {
  getCredentials,
};
