import yargs from "yargs";
import { MinervaFacade } from "./lib/MinervaFacade";
import { Region, Stage } from "Commons/Isengard";
import { isOptInRegion, toRegionName } from "Commons/utils/regions";
import logger from "Commons/utils/logger";
import {
  allLimitNames,
  allLimitsByName,
  arroyoBasedLimits,
} from "./lib/MinervaLimit";
import { validateLimitUpdateRules } from "./lib/LimitUpdateValidator";
import { allRuleNames } from "./lib/LimitUpdateRules";
import { ServiceQuotaQueue } from "Commons/sqs/ServiceQuotaQueue";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Update the service limit for customer's account. " +
        "Example usage:\n" +
        "npx ts-node updateCustomerAccountLimit.ts --region iad --accountId 123123123123 --limitName CUSTOMER_APP_PER_REGION_COUNT --value 30" +
        "npx ts-node updateCustomerAccountLimit.ts --region iad --accountId 386460259235 --appId=d123451231 --limitName REQUEST_TOKENS_PER_SECOND --value 20000"
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
    .option("appId", {
      describe: "app id required for RPS limit increase",
      type: "string",
      demandOption: false,
      default: undefined,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limitName, value, rulesToBypass, appId } =
    args;

  if (isOptInRegion(region)) {
    logger.error(
      `${region} is an opt-in region and is not supported by this tool because it was not onboarded properly to Minerva.
See the runbook for next steps: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HSupportedLimitIncreases`
    );
    process.exit(1);
  }

  const regionName = toRegionName(region);

  const minerva = new MinervaFacade(stage as Stage, regionName);

  const currentLimit = await minerva.getLimit(limitName, accountId, appId);

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

  if (arroyoBasedLimits.includes(limitName)) {
    if (!appId) {
      throw new Error("AppId is required for RPS limits");
    }
    await sendSQSMessage(
      stage as Stage,
      regionName,
      appId!,
      limitName,
      value,
      accountId
    );
  } else {
    await minerva.updateLimit(limitName, accountId, value);
  }

  if (!arroyoBasedLimits.includes(limitName)) {
    //for RPS limits, we will not get accurate value from minerva since there's a delay.
    const newLimit = await minerva.getLimit(limitName, accountId, appId);
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
}

async function sendSQSMessage(
  stage: Stage,
  region: Region,
  appId: string,
  limitName: string,
  value: number,
  accountId: string
) {
  const serviceQuotaQueue = new ServiceQuotaQueue(stage, region);
  serviceQuotaQueue.init();
  await serviceQuotaQueue.sendUpdateLimitMessage(
    appId,
    limitName,
    value,
    accountId
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
