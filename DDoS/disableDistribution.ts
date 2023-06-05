import yargs from "yargs";
import { disableDistribution, enableDistribution } from "../utils/cloudfront";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";
import logger from "../utils/logger";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Isengard";

const { hideBin } = require("yargs/helpers");

/**
Use this script when the automated mitigation did not trigger and there are Lambda throttles caused
by a Cache Busting event. To determine what distribution to disable, find the Top Talker using Runbook:
https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/Build/CacheBustingAttack/#HCase1%3AManualmitigation

Example usage

npx ts-node disableDistribution.ts \
--stage prod \
--region fra \
--ticket V836586918 \
--distributionId E1PF40AMR6UHX0 \
--mode disable

Tip: Use EdgeTools to find distributionId searching by CF domainId (i.e. dfd1ekjh298lfl)
https://edge-tools.amazon.com
*/

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
      Disables a CloudFront distribution. Example usage:
        npx ts-node disableDistribution.ts \
          --stage prod \
          --region pdx \
          --ticket V836586918 \
          --distributionId E1PF40AMR6UHX0 \
          --mode disable
    `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2 or pdx",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .option("distributionId", {
      describe: "Target distributionId, i.e. E189289DHJFC",
      type: "string",
      demandOption: true,
    })
    .option("mode", {
      type: "string",
      demandOption: true,
      describe: "Whether to disable or enable the distribution",
      choices: ["disable", "enable"],
      default: "disable",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, distributionId, ticket, mode } = args;
  process.env.ISENGARD_SIM = ticket;

  const account = await controlPlaneAccount(stage as Stage, region as Region);
  const cloudFrontClient = new CloudFrontClient({
    region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      "OncallOperator"
    ),
  });

  if (mode === "disable") {
    logger.info(
      "Disabling distribution %s in stage %s and region %s",
      distributionId,
      stage,
      region
    );

    await disableDistribution({
      cloudFrontClient,
      distributionId,
    });
  } else {
    logger.info(
      "Enabling distribution %s in stage %s and region %s",
      distributionId,
      stage,
      region
    );

    await enableDistribution({
      cloudFrontClient,
      distributionId,
    });
  }

  logger.info("Distribution updated successfully");
  logger.info(
    "Check update progress: %s",
    `https://edge-tools.amazon.com/distributions/${distributionId}?region=Global&stage=Prod`
  );
}

main()
  .then()
  .catch((e) => console.warn(e));
