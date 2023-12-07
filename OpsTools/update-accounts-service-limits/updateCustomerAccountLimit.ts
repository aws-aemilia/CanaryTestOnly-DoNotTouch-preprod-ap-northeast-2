import yargs from "yargs";
import { MinervaFacade } from "./lib/MinervaFacade";
import { Stage } from "Commons/Isengard";
import { isOptInRegion, toRegionName } from "Commons/utils/regions";
import logger from "Commons/utils/logger";
import {
  adjustableLimitsNames,
  allLimitNames,
  allLimitsByName,
} from "./lib/MinervaLimit";
import { validateLimitUpdateRules } from "./lib/LimitUpdateValidator";
import { allRuleNames } from "./lib/LimitUpdateRules";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Update the service limit for customer's account. " +
        "Example usage:\n" +
        "npx ts-node updateCustomerAccountLimit.ts --region iad --accountId 386460259235 --limitName CUSTOMER_APP_PER_REGION_COUNT --value 30"
    )
    .option("stage", {
      describe: "Stage to run the command in",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "Region to run the command in (i.e. us-east-1 etc)",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "customer account id",
      type: "string",
      demandOption: true,
    })
    .option("limitName", {
      description: "Name of limit to change",
      type: "string",
      demandOption: true,
      choices: allLimitNames,
    })
    .option("value", {
      description: "Value to update limit with",
      type: "number",
      demandOption: true,
    })
    .option("rulesToBypass", {
      description:
        "validation rules that you want to bypass. Use with caution ",
      type: "string",
      choices: allRuleNames,
      array: true,
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limitName, value, rulesToBypass } = args;

  if (isOptInRegion(region)) {
    logger.error(
      `${region} is an opt-in region and is not supported by this tool because it was not onboarded properly to Minerva.
See the runbook for next steps: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HSupportedLimitIncreases`
    );
    process.exit(1);
  }

  const regionName = toRegionName(region);

  const minerva = new MinervaFacade(stage as Stage, regionName);

  const currentLimit = await minerva.getLimit(limitName, accountId);

  try {
    await validateLimitUpdateRules({
      minervaLimit: allLimitsByName[limitName],
      currentValue: currentLimit?.SubjectLimit.Value.SingleValue,
      newValue: value,
      rulesToBypass,
    });
  } catch (e) {
    logger.error((e as Error).message);
    process.exit(1);
  }

  await minerva.updateLimit(limitName, accountId, value);
  const newLimit = await minerva.getLimit(limitName, accountId);

  logger.info(
    `
***** COPY EVERYTHING BELOW TO PASTE INTO TICKET *****
Customer limit increased: 
\`\`\`
${JSON.stringify(newLimit, null, 2)}
\`\`\`
Note: The limit is only applicable in the **${regionName}** region.  If the customer would like another limit increase please make another request via the [Service Quotas dashboard](https://aws.amazon.com/blogs/mt/introducing-service-quotas-view-and-manage-your-quotas-for-aws-services-from-one-central-location/).
`
  );
}

main()
  .then(() => {
    console.info("All done!");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
