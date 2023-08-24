import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";
import { CloudFront, MinimumProtocolVersion } from "@aws-sdk/client-cloudfront";
import { toRegionName } from "../../Commons/utils/regions";
import { createLogger } from "../../Commons/utils/logger";

const LATEST_TLS_VERSION = MinimumProtocolVersion.TLSv1_2_2021;
const logger = createLogger();

async function getArgs() {
  return await yargs(hideBin(process.argv))
    .usage(
      `
      Upgrade a CloudFront distribution to the latest TLS version (as of now, ${LATEST_TLS_VERSION}).
      
      Example:
      # Upgrade distribution E3JJ5J4JIPW1XO in PDX (an interactive prompt for Contingent Authorization will appear)
      ts-node upgradeCloudFrontTLS.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO
        
      # Upgrade distribution E3JJ5J4JIPW1XO in PDX with a ticket for Contingent Authorization
      ts-node upgradeCloudFrontTLS.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO \
        --ticket https://t.corp.amazon.com/V938010847/communication
        
      # Upgrade distribution E3JJ5J4JIPW1XO in beta PDX
      ts-node upgradeCloudFrontTLS.ts \
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
    .option("ticket", {
      describe: `A SIM ticket used to pass Contingent Authorization.`,
      type: "string",
      alias: "t",
    })
    .strict()
    .version(false)
    .help().argv;
}

async function main() {
  const { stage, region, distributionId, ticket } = await getArgs();
  const regionName = toRegionName(region);
  process.env.ISENGARD_SIM = ticket ?? ""; // If the ticket option isn't provided, set the env var to an empty string so that the interactive prompt is used

  const controlPlaneAccount_ = await controlPlaneAccount(
    stage as Stage,
    regionName
  );
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

  if (
    distributionConfig?.ViewerCertificate?.MinimumProtocolVersion ==
    LATEST_TLS_VERSION
  ) {
    logger.warn(
      `Distribution ${distributionId} already has the latest TLS version; skipping update.`
    );
  } else {
    try {
      distributionConfig!.ViewerCertificate!.MinimumProtocolVersion =
        LATEST_TLS_VERSION;
    } catch {
      throw new Error(
        `DistributionConfig is missing attribute path ViewerCertificate.MinimumProtocolVersion: ${distributionConfig}`
      );
    }

    await cloudFront.updateDistribution({
      Id: distributionId,
      IfMatch: getDistributionOutput.ETag,
      DistributionConfig: distributionConfig,
    });
    logger.info(
      `Upgraded distribution ${distributionId} to TLS version ${LATEST_TLS_VERSION}.`
    );
  }
}

main().catch(console.error);
