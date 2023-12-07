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
import { CacheBehavior } from "aws-sdk/clients/cloudfront";
import confirm from "Commons/utils/confirm";

const logger = createLogger();

async function getArgs() {
  return await yargs(hideBin(process.argv))
    .usage(
      `
      Update a CloudFront distribution with a new cache behavior for Next.js static assets (/_next/static/*).

      Example:
      # Upgrade distribution E3JJ5J4JIPW1XO in PDX (an interactive prompt for Contingent Authorization will appear)
      ts-node addNextStaticCacheBehavior.ts \
        --region pdx \
        --distributionId E3JJ5J4JIPW1XO

      # Upgrade distribution E3JJ5J4JIPW1XO in beta PDX
      ts-node addNextStaticCacheBehavior.ts \
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

  const TargetOriginId =
    distributionConfig?.DefaultCacheBehavior?.TargetOriginId;

  if (!TargetOriginId) {
    throw new Error(
      `Distribution ${distributionId} DefaultCacheBehavior does not have a TargetOriginId.`
    );
  }

  const RealtimeLogConfigArn =
    distributionConfig?.DefaultCacheBehavior?.RealtimeLogConfigArn;

  if (!RealtimeLogConfigArn) {
    throw new Error(
      `Distribution ${distributionId} DefaultCacheBehavior does not have a RealtimeLogConfigArn.`
    );
  }

  if (
    distributionConfig?.CacheBehaviors?.Items?.some(
      (cb) => cb.PathPattern === "/_next/static/*"
    )
  ) {
    throw new Error(
      `CacheBehavior for Next.js static assets already exists for distribution ${distributionId} in ${regionName}.`
    );
  }

  const nextStaticCacheBehavior = getNextStaticCacheBehavior({
    TargetOriginId,
    RealtimeLogConfigArn,
  });

  distributionConfig.CacheBehaviors = {
    Quantity: 1,
    Items: [nextStaticCacheBehavior],
  };

  if (
    await confirm(
      `Are you sure you want to add the following CacheBehavior to distribution ${distributionId}?: ` +
        JSON.stringify(nextStaticCacheBehavior, undefined, 2)
    )
  ) {
    await cloudFront.updateDistribution({
      Id: distributionId,
      IfMatch: getDistributionOutput.ETag,
      DistributionConfig: distributionConfig,
    });
    logger.info(
      `CacheBehavior for Next.js static assets added for distribution ${distributionId} in ${regionName}.`
    );
    logger.info(
      `Check the progress in Edge Tools: https://edge-tools.amazon.com/distributions/${distributionId}?region=Global&stage=${stage}`
    );
  }
}

const getNextStaticCacheBehavior = ({
  TargetOriginId,
  RealtimeLogConfigArn,
}: {
  TargetOriginId: string;
  RealtimeLogConfigArn: string;
}): CacheBehavior => {
  return {
    PathPattern: "/_next/static/*",
    TargetOriginId,
    TrustedSigners: { Enabled: false, Quantity: 0 },
    TrustedKeyGroups: { Enabled: false, Quantity: 0 },
    ViewerProtocolPolicy: "redirect-to-https",
    AllowedMethods: {
      Quantity: 7,
      Items: ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"],
      CachedMethods: { Quantity: 2, Items: ["HEAD", "GET"] },
    },
    SmoothStreaming: false,
    Compress: true,
    LambdaFunctionAssociations: { Quantity: 0 },
    FunctionAssociations: { Quantity: 0 },
    FieldLevelEncryptionId: "",
    RealtimeLogConfigArn,
    ForwardedValues: {
      QueryString: true,
      Cookies: { Forward: "none" },
      Headers: {
        Quantity: 4,
        Items: ["Authorization", "Accept", "CloudFront-Viewer-Country", "Host"],
      },
      QueryStringCacheKeys: { Quantity: 0 },
    },
    MinTTL: 2,
    DefaultTTL: 2,
    MaxTTL: 600,
  };
};

main().catch(console.error);
