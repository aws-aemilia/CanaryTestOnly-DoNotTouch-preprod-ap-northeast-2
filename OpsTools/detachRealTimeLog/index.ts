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

    Example:
    # Detach distribution E3JJ5J4JIPW1XO in PDX (an interactive prompt for Contingent Authorization will appear)
    ts-node index.ts \
    --region pdx \
    --distributionId E3JJ5J4JIPW1XO

    # Re-attach distribution E3JJ5J4JIPW1XO in PDX (an interactive prompt for Contingent Authorization will appear)
    ts-node index.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO \
        --reattach true

    # Detach distribution E3JJ5J4JIPW1XO in beta PDX
    ts-node index.ts \
    --region pdx \
    --distributionId E3T5LHA7KA0DXT \
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
    .option("reattach", {
      describe: "Reattach the distribution to real time log destination",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;
}

async function main() {
  const { stage, region, distributionId, reattach } = await getArgs();
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
    getDistributionOutput.Distribution?.DistributionConfig;

  if (reattach) {
    const realTimeLogConfigArn = `arn:aws:cloudfront::${controlPlaneAccount_.accountId}:realtime-log-config/RealTimeLogConfigHostingMetrics`;
    distributionConfig!.DefaultCacheBehavior!.RealtimeLogConfigArn =
      realTimeLogConfigArn;
    logger.info(
      `Re-attaching distribution to real time log destination ${realTimeLogConfigArn}`
    );
  } else {
    distributionConfig!.DefaultCacheBehavior!.RealtimeLogConfigArn = undefined;
    logger.info(`Detaching distribution from real time log destination`);
  }

  await cloudFront.updateDistribution({
    Id: distributionId,
    IfMatch: getDistributionOutput.ETag,
    DistributionConfig: distributionConfig,
  });

  logger.info(`Distribution ${distributionId} updated`);
}

main().catch(console.error);
