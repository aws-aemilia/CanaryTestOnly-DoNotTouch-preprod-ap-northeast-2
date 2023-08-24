import { AmplifyAccount } from "../../Commons/Isengard";

export function buildDnsNameFromAccountWithAirportCode(
  accountWithAirportCode: AmplifyAccount
) {
  if (accountWithAirportCode.stage === "beta") {
    return "iamalive-beta.com";
  }

  const lowercaseAirpotCode = accountWithAirportCode.airportCode.toLowerCase();
  if (accountWithAirportCode.stage === "gamma") {
    return `iamalive-gamma${lowercaseAirpotCode}.com`;
  }

  if (accountWithAirportCode.stage === "prod") {
    return `iamalive-${lowercaseAirpotCode}.com`;
  }

  throw new Error(
    "Only beta, gamma, and prod stages are allowed to have the `custom-domain-maker` run!!"
  );
}
