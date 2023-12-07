import yargs from "yargs";
import { MinervaFacade } from "./lib/MinervaFacade";
import { Stage } from "Commons/Isengard";
import { toRegionName } from "Commons/utils/regions";
import logger from "Commons/utils/logger";
import { allLimitNames, allLimitsByName } from "./lib/MinervaLimit";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      "Read the service limit for customer's account. " +
        "Example usage:\n" +
        "npx ts-node getCustomerAccountLimit.ts --region iad --accountId 386460259235 --limitName CUSTOMER_APP_PER_REGION_COUNT"
    )
    .option("stage", {
      describe: "Stage to run the command in",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
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
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limitName } = args;

  const minerva = new MinervaFacade(stage as Stage, toRegionName(region));

  const result = await minerva.getLimit(limitName, accountId);

  if (result) {
    logger.info(
      `Current customer limit: 
\`\`\`
${JSON.stringify(result, null, 2)}
\`\`\`
`
    );
  } else {
    const limit = allLimitsByName[limitName];
    logger.info(
      `No limit override found for ${limitName}, ${accountId}. The default limit value of ${limit.defaultLimit} applies`
    );
  }
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
