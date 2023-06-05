import { execSync } from "child_process";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import pino from "pino";
import pinoPretty from "pino-pretty";

import { AmplifyClient, ListAppsCommand } from "@aws-sdk/client-amplify";
import { integTestAccount } from "./Isengard/accounts";
import { getIsengardCredentialsProvider, Region, Stage } from "./Isengard";

const log = pino(pinoPretty());

export function canEstablishConnection({
  domain,
  tlsVersion,
}: {
  domain: string;
  tlsVersion: string;
}) {
  try {
    const res = execSync(
      `curl --verbose --tlsv${tlsVersion} --tls-max ${tlsVersion} https://${domain}/apps`,
      {
        encoding: "utf-8",
        stdio: "pipe",
      }
    );

    try {
      const { message } = JSON.parse(res);

      if (message == "Missing Authentication Token") {
        log.info({ domain, tlsVersion }, "Connection successful");
        return true;
      } else {
        throw new Error("Unexpected response");
      }
    } catch (err) {
      log.error(err, `failed to parse message ${res}`);
    }
  } catch (err) {
    log.error({ domain, tlsVersion }, "Connection failed");
  }

  return false;
}

export async function canListApps({
  domain,
  stage,
  region,
}: {
  domain: string;
  stage: Stage;
  region: Region;
}) {
  const account = await integTestAccount(stage, region);

  const client = new AmplifyClient({
    endpoint: `https://${domain}`,
    region,
    credentials: getIsengardCredentialsProvider(account.accountId, "ReadOnly"),
  });

  try {
    await client.send(new ListAppsCommand({}));
    log.info("ListApps success");
    return true
  } catch (err) {
    log.info(err, "ListApps failed");

    return false
  }
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
  npx ts-node verifyTLSVersion.ts --domain amplify.ap-east-1.amazonaws.com
  npx ts-node verifyTLSVersion.ts --domain amplify.ap-east-1.amazonaws.com --allowTLS1_0
  `
    )
    .option("domain", {
      describe: "i.e. amplify.ap-east-1.amazonaws.com",
      type: "string",
      demandOption: true,
    })

    .option("allowTLS1_0", {
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { domain, allowTLS1_0 } = args;
  let stage: Stage;
  let region: Region;

  if (/amplify\.[\w\d-]+\.amazonaws\.com/.test(args.domain)) {
    region = args.domain.split(".")[1] as Region;
    stage = "prod";
  } else if (
    /(beta|gamma|preprod)\.[\w\d-]+\.controlplane\.amplify\.aws\.dev/.test(
      args.domain
    )
  ) {
    stage = args.domain.split(".")[0] as Stage;
    region = args.domain.split(".")[1] as Region;
  } else {
    throw new Error('cannot pick region and stage from domain - this is required for selecting Integ Test account for ListApps check')
  }

  const canEstablishConnection1_0 = canEstablishConnection({
    domain,
    tlsVersion: "1.0",
  });
  const canEstablishConnection1_1 = canEstablishConnection({
    domain,
    tlsVersion: "1.1",
  });
  const canEstablishConnection1_2 = canEstablishConnection({
    domain,
    tlsVersion: "1.2",
  });

  if (allowTLS1_0 && !canEstablishConnection1_0) {
    throw new Error("Failed to establish connection using TLSv1.0");
  }
  if (allowTLS1_0 && !canEstablishConnection1_1) {
    throw new Error("Failed to establish connection using TLSv1.1");
  }

  if (!allowTLS1_0 && canEstablishConnection1_0) {
    throw new Error("Connection established using TLSv1.0");
  }
  if (!allowTLS1_0 && canEstablishConnection1_1) {
    throw new Error("Connection established using TLSv1.1");
  }

  // These should always work.
  if (!canEstablishConnection1_2) {
    throw new Error("Failed to establish connection using TLSv1.2");
  }
  if (!(await canListApps({ domain, stage, region }))) {
    throw new Error(`Cannot ListApps in ${domain}`);
  }
}

main().catch((err) => {
  log.error(err);

  process.exit(1);
});
