import { getIsengardCredentialsProvider, Stage } from "Commons/Isengard";
import { buildControlPlaneEndpoint } from "Commons/utils/controlPlaneEndpoint";
import { toRegionName } from "Commons/utils/regions";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runAllTests } from "./testCases";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Runs domain association tests from end to end on the specified AWS account. This will run two tests:
  1. Create, update, and delete a domain association (emualtes end to end usual console experience).
  2. Create domain association, and update it with different subDomainSettings multiple times (emulates autoSubDomain feature). 
  
This script should be run on an AWS account that has custom ssl feature flag off, for the purpose of verifying that the existing domain association flow is not broken.

Example usage: npx ts-node SingleUseTools/CustomSslMCM/verify.ts --stage gamma --region iad --accountId <account-id> --domainName <domain-name>
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "accountId to run Amplify domain association flows in",
      type: "string",
      demandOption: true,
    })
    .option("domainName", {
      describe: "custom domain name to use for the domain association",
      type: "string",
      demandOption: true,
    })
    .option("roleName", {
      describe: "IAM role to assume for this verification script",
      type: "string",
      default: "Admin",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { accountId, domainName, roleName, region, stage } = args;

  const regionName = toRegionName(region);
  const endpoint = buildControlPlaneEndpoint(stage as Stage, regionName);
  const credentials = getIsengardCredentialsProvider(accountId, roleName);

  await runAllTests({
    credentials,
    domainName,
    endpoint,
    regionName,
  });
}

main().catch();
