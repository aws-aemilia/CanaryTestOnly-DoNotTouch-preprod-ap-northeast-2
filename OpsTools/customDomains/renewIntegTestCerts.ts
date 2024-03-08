import log from "Commons/utils/logger";
import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
  integTestAccounts,
  StandardRoles,
  Stage,
  Region,
} from "Commons/Isengard";
import { SecretsManager } from "aws-sdk";
import toolsAccount from "Commons/Isengard/cache/toolsAccount.json";
import { execSync } from "child_process";
import fs from "fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const SecretId = "CustomSSLRenewalTestCertificate";

async function getArgs() {
  return yargs(hideBin(process.argv))
    .usage(
      `Renew certificates for the purpose of Custom SSL Renewal integration tests. This script uses Let's Encrypt's
      certbot CLI to request a 90-day certificate issued by Let's Encrypt, and stores it in the
      aws-mobile-aemilia-tools@amazon.com account to be retrieved by integration tests: https://tiny.amazon.com/bu2ymozu/IsenLink
      
      Examples:
        $ ts-node renewIntegTestCerts.ts
        $ ts-node renewIntegTestCerts.ts --region "pdx" --stage "beta" --install
    `
    )
    .option("region", {
      describe:
        "The integration test account's region. If left blank, this script executes in all regions.",
      type: "string",
    })
    .option("stage", {
      describe:
        "The integration test account's region. If left blank, this script executes in all stages.",
      type: "string",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("install", {
      describe:
        "Whether to install the certbot CLI and the associated Route53 plugin. Only needed for the first run.",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;
}

/**
 * Install and set up the certbot CLI
 */
function installCertbot() {
  // Install the core certbot binary
  execSync("brew install certbot", { stdio: "inherit" });

  // Install the certbot-dns-route53 plugin to automate Route53 ownership verification
  execSync("pip3 install certbot-dns-route53", { stdio: "inherit" });

  // Gain read/write privileges in the letsencrypt (certbot's backend) directory
  // The fs.chmodSync method does not work recursively, so we fall back to the raw CLI command
  execSync("sudo chmod -R 777 /etc/letsencrypt", { stdio: "inherit" });
}

/**
 * Delete existing certificates in the /etc/letsencrypt/live/ directory. All previously issued certificates can be
 * recovered from /etc/letsencrypt/archive/.
 */
function deleteExistingCerts() {
  // The fs.rmSync method does not work recursively on this directory, so we fall back to the raw CLI command
  execSync(`sudo rm -rf /etc/letsencrypt/live/*`, { stdio: "inherit" });
}

async function getSecretsManager() {
  const credentials = await getIsengardCredentialsProvider(
    toolsAccount.accountId,
    StandardRoles.Admin
  )();
  return new SecretsManager({
    credentials,
    region: "us-east-1",
  });
}

async function getRenewalCertificateSecret(secretsManager: SecretsManager) {
  const secretValue = await secretsManager
    .getSecretValue({
      SecretId,
    })
    .promise();
  return JSON.parse(secretValue.SecretString || "{}");
}

async function putRenewalCertificateSecret(
  secretsManager: SecretsManager,
  secretString: any
) {
  return await secretsManager
    .putSecretValue({
      SecretId,
      SecretString: JSON.stringify(secretString),
    })
    .promise();
}

/**
 * Extract the core certificate from the certificate chain. The core certificate is the first PEM/X.509 certificate
 * in the chain.
 */
function getCertificateFromFullChain(fullCertificateChain: string) {
  const endCertificate = "-----END CERTIFICATE-----";
  const endCertificateIndex = fullCertificateChain.indexOf(endCertificate);
  return (
    fullCertificateChain.substring(0, endCertificateIndex) + endCertificate
  );
}

/**
 * Retrieve the requested certificate's data from the output of a certbot execution.
 */
function getCertificateData(certbotOutput: string) {
  if (certbotOutput.includes("Successfully received certificate")) {
    const certbotOutputLines = certbotOutput.split("\n");
    const certificatePathLine = certbotOutputLines.find((line) =>
      line.includes("Certificate is saved at:")
    );
    const privateKeyPathLine = certbotOutputLines.find((line) =>
      line.includes("Key is saved at:")
    );

    if (certificatePathLine && privateKeyPathLine) {
      const certificatePath = certificatePathLine.split(/:\s*/)[1];
      const privateKeyPath = privateKeyPathLine.split(/:\s*/)[1];

      // certbot will print out the certificate's directory as /etc/letsencrypt/live/..., but they are symlinks to the
      // /etc/letsencrypt/archive directory. We need to gain read privileges on that directory to be able to
      // read certificate data.
      execSync(`sudo chmod -R 444 /etc/letsencrypt/archive`, {
        stdio: "inherit",
      });

      const certificateChain = fs.readFileSync(certificatePath, "utf8");
      const certificate = getCertificateFromFullChain(certificateChain);
      const privateKey = fs.readFileSync(privateKeyPath, "utf8");

      return { certificate, privateKey, certificateChain };
    }
  }

  throw new Error(`Failed to get certificate data`);
}

/**
 * Request a certificate using the certbot CLI.
 * @param account The integration test account for which to request the certificate
 */
async function requestCertificate(account: AmplifyAccount) {
  const credentials = await getIsengardCredentialsProvider(
    account.accountId,
    StandardRoles.Admin
  )();

  const credentialsEnv = `AWS_ACCESS_KEY_ID=${credentials.accessKeyId} AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey} AWS_SESSION_TOKEN=${credentials.sessionToken}`;
  const certbotCommand = `certbot certonly --dns-route53 -d customssl.${account.stage}-${account.region}-test.amplifyintegrationtest.com`;
  const command = `sudo ${credentialsEnv} ${certbotCommand}`;

  let certbotOutput = execSync(command, {
    env: { PATH: process.env.PATH + ":/opt/homebrew/bin" }, // Needed to find the certbot binary on Apple Silicon
    shell: "/bin/zsh",
  }).toString();
  log.info(certbotOutput);
  return certbotOutput;
}

async function main() {
  const { region, stage, install } = await getArgs();
  if (install) {
    installCertbot();
  }
  deleteExistingCerts();

  const secretsManager = await getSecretsManager();
  let secretString = await getRenewalCertificateSecret(secretsManager);

  const accounts = await integTestAccounts({
    stage: stage as Stage,
    region: region as Region,
  });

  for (const account of accounts) {
    const certbotOutput = await requestCertificate(account);
    const { certificate, privateKey, certificateChain } =
      getCertificateData(certbotOutput);

    secretString[`${account.stage}:${account.region}:certificate`] =
      certificate;
    secretString[`${account.stage}:${account.region}:privateKey`] = privateKey;
    secretString[`${account.stage}:${account.region}:certificateChain`] =
      certificateChain;
  }

  await putRenewalCertificateSecret(secretsManager, secretString);
}

main().catch(console.log);
