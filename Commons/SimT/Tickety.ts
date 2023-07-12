import { CrtSignerV4 } from "@aws-sdk/signature-v4-crt";
import { Sha256 } from "@aws-crypto/sha256-js";
import { Tickety } from "@amzn/tickety-typescript-sdk";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { exec } from "../utils/exec";
import { createLogger } from "../utils/logger";
import { controlPlaneAccount, getIsengardCredentialsProvider } from "../Isengard";

/*
 Use these default values for each request to Tickety.
 For example: https://tiny.amazon.com/15vtqute4/codeamazpackTickblob94f2src
*/
export const AWS_ACCOUNT_ID = "Default", TICKETING_SYSTEM_NAME = "Default";

const log = createLogger();

/**
 * Convenience method for onboarding a given account to Tickety. This method is idempotent; calling it for an
 * already-onboarded account will succeed. It essentially follows the instructions here:
 * https://w.amazon.com/bin/view/IssueManagement/SIMTicketing/TicketyAPI/GettingStarted
 *
 * @param accountId The ID of the account to be onboarded
 */
export async function sendTicketyOnboardingRequest(accountId: string) {
  const response = await exec(`
        curl -L -b ~/.midway/cookie -c ~/.midway/cookie -i \\
        https://midway.us-west-2.cti.api.tickety.amazon.dev/default/default/accessGrants \\
        -X POST -H 'Content-Type: application/json' \\
        -d '{"accessGrant":{"id":"${accountId}","effect":"Allow","type":"AwsAccountId","reason":"Onboard AWS Amplify Hosting team account"}}'
    `)

  if (response.stdout.includes("HTTP/1.1 200 OK")) {
    log.info(`Successfully onboarded account ${accountId} to Tickety.`)
  } else {
    const lastLineIndex = response.stdout.lastIndexOf('\n') + 1;
    const lastLine = response.stdout.substring(lastLineIndex);
    log.error(lastLine)
    throw new Error(`Failed to onboard account ${accountId} to Tickety.`)
  }
}

/**
 * Create a Tickety client with credentials from the beta PDX account, on the TicketyFullAccess role:
 * https://isengard.amazon.com/manage-accounts/033345365959/console-roles
 *
 * The account that's used to call Tickety doesn't really matter, since you won't be interacting with resources in that
 * account. We simply use beta PDX, since it's a non-prod account, it's known to be onboarded to Tickety, and it has
 * the required permissions in its TicketyFullAccess role.
 */
export async function createDefaultTickety() {
  const account = await controlPlaneAccount("beta", "pdx");
  const credentials = getIsengardCredentialsProvider(account.accountId, "TicketyFullAccess");
  return createTickety(credentials);
}

/**
 * Create a Tickety client with a request signer, so that it can call the better global endpoint. See Tickety's example
 * client: https://code.amazon.com/packages/TicketyServiceTypeScriptExamples/blobs/mainline/--/src/client.ts
 *
 * @param credentials Credentials for an account onboarded to Tickety, and a role authorized to call Tickety.
 */
export function createTickety(credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>) {
  const signer = new CrtSignerV4({
    credentials,
    region: "*",
    service: "tickety",
    sha256: Sha256,
    applyChecksum: true,
    signingAlgorithm: 1,
    // There were issues with importing AwsSigningAlgorithm from @aws-sdk/signature-v4-crt, so we simply use the
    // enum index of 1. https://amzn-aws.slack.com/archives/C03RW574YQZ/p1688739515862139
  });

  return new Tickety({
    credentials: credentials,
    endpoint: "https://global.api.tickety.amazon.dev/",
    retryMode: "adaptive",
    signer,
  });
}

/**
 * A brief example of how to use the methods in this module. Run it with: `ts-node Commons/libs/Tickety.ts`
 */
async function example() {
  await sendTicketyOnboardingRequest("033345365959")
  const tickety = await createDefaultTickety();

  const ticketId = "V957722355";
  const res = await tickety.getTicket({
    ticketId,
    awsAccountId: AWS_ACCOUNT_ID,
    ticketingSystemName: TICKETING_SYSTEM_NAME,
  })

  log.info(`Ticket ${ticketId} has title: ${res.ticket?.title}`)
}

example().catch(console.error)
