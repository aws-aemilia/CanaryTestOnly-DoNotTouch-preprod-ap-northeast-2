import { spawnSync } from "child_process";
import os from "os";
import path from "path";
import { getMidwayCookieStore } from "@amzn/midway-client";

const homeDir = os.homedir();
const cookiePath = path.join(homeDir, ".midway", "cookie");

interface MidwayCookie {
  value: string;
  expires: string;
}

export async function getSsoCookie(): Promise<MidwayCookie> {
  // Visit paging corp to refresh the amzn_sso_token cookie
  spawnSync("curl", [
    "-L",
    "-s",
    "--cookie",
    cookiePath,
    "--cookie-jar",
    cookiePath,
    "https://paging.corp.a2z.com",
  ]);

  // Now that the cookie is refreshed, we can read it from the cookie jar
  const store = await getMidwayCookieStore(homeDir);
  return new Promise((resolve, reject) => {
    store.findCookie(
      "paging.corp.a2z.com",
      "/",
      "amzn_sso_token",
      (err, cookie) => {
        if (err) {
          reject(err);
        } else if (!cookie) {
          reject("amzn_sso_token not found in midway cookie");
        } else {
          resolve(cookie as MidwayCookie);
        }
      }
    );
  });
}
