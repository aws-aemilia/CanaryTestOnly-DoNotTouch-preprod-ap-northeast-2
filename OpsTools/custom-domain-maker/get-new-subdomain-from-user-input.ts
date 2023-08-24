import { AmplifyAccount } from "../../Commons/Isengard";
import { buildDnsNameFromAccountWithAirportCode } from "./build-dns-name-from-account-with-airport-code";
import { exitIfNotContinuing } from "./exit-if-not-continuing";
import { validateResponseWithMessage } from "./validate-response-with-message";

export async function getNewSubdomainFromUserInput(
  allAccountsWithAirportCodes: AmplifyAccount[]
): Promise<string> {
  console.log(`You are about to create a new subdomain for all 'iamalive' domains. Please enter only the subdomain, NOT the entire domain.

Eg. a-basic-subdomain

It should be all lowercases letters, numbers, and hyphens.
`);

  const newSubdomain = await validateResponseWithMessage({
    prompt: "What is the name of your custom domain? ",
    regex: /^[0-9a-z][0-9a-z-]*[0-9a-z]$/,
    errorMessage:
      "Subdomains must only consist of lowercase letters, numbers, and hyphens.",
  });

  const newDomains: string[] = [];
  allAccountsWithAirportCodes.forEach((accountWithAirportCode) => {
    const iamaliveDomain = buildDnsNameFromAccountWithAirportCode(
      accountWithAirportCode
    );
    newDomains.push(`${newSubdomain}.${iamaliveDomain}`);
  });

  console.log(`
The following domains will be created:
${newDomains.join("\n")}

Please ensure these are correct. This will create a lot of resources across many accounts.`);

  await exitIfNotContinuing();

  console.log(
    `\nSeriously - make sure this is 100% correct before continuing. There is no script to cleanup mistakes.`
  );

  await exitIfNotContinuing();

  return newSubdomain;
}
