import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import { toRegionName } from "../../Commons/utils/regions";
import { createLogger } from "../../Commons/utils/logger";

const logger = createLogger();

async function getArgs() {
  return await yargs(hideBin(process.argv))
    .usage(
      `
      Update a CloudFront distribution default and min TTL setting to 0.

      Example:
      # Upgrade distribution E3JJ5J4JIPW1XO in PDX (an interactive prompt for Contingent Authorization will appear)
      ts-node updateCacheTTL.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO

      # Upgrade distribution E3JJ5J4JIPW1XO in PDX with a ticket for Contingent Authorization
      ts-node updateCacheTTL.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO \
        --ticket https://t.corp.amazon.com/V938010847/communication

      # Upgrade distribution E3JJ5J4JIPW1XO in beta PDX
      ts-node updateCacheTTL.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO \
        --stage beta
    `
    )
    .option("stage", {
      describe: `The stage that the distribution is in (e.g. prod, beta, gamma).`,
      type: "string",
      default: "prod",
      alias: "s",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: `The region that the distribution is in (e.g. pdx, PDX, us-west-2).`,
      type: "string",
      demandOption: true,
      alias: "r",
    })
    .option("distributionId", {
      describe: `The distribution ID (e.g. E1234567890).`,
      type: "string",
      demandOption: true,
      alias: "d",
    })
    .strict()
    .version(false)
    .help().argv;
}

async function main() {
  const { stage, region, distributionId } = await getArgs();
  const regionName = toRegionName(region);

  const controlPlaneAccount_ = await controlPlaneAccount(
    stage as Stage,
    regionName
  );

  await preflightCAZ({
    accounts: [controlPlaneAccount_],
    role: StandardRoles.OncallOperator,
  });

  const cloudFront = new CloudFront({
    region: regionName,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount_.accountId,
      StandardRoles.OncallOperator
    ),
  });

  const getDistributionOutput = await cloudFront.getDistribution({
    Id: distributionId,
  });
  const distributionConfig =
    getDistributionOutput.Distribution!.DistributionConfig;

  if (
    distributionConfig?.DefaultCacheBehavior?.DefaultTTL != 0 ||
    distributionConfig?.DefaultCacheBehavior?.MinTTL != 0
  ) {
    distributionConfig!.DefaultCacheBehavior!.DefaultTTL = 0;
    distributionConfig!.DefaultCacheBehavior!.MinTTL = 0;

    await cloudFront.updateDistribution({
      Id: distributionId,
      IfMatch: getDistributionOutput.ETag,
      DistributionConfig: distributionConfig,
    });
    logger.info(
      `Cache TTL in distribution ${distributionId} update is in progress.`
    );
    logger.info(
      `Check the progress in Edge Tools: https://edge-tools.amazon.com/distributions/${distributionId}?region=Global&stage=${stage}`
    );
  } else {
    logger.info(
      `Distribution ${distributionId} already has the cache TTL settings set to 0.`
    );
  }
}

main().catch(console.error);
