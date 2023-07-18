import {
  AmplifyAccount,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  meteringAccount,
  Region,
  Stage,
} from "../../Commons/Isengard";
import { getApps, toDistroARN } from "./libs/commons";
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { HostingDTOMeteringMessageBuilder } from "./libs/HostingDTOMeteringMessageBuilder";
import { AppDO } from "../../Commons/dynamodb";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import logger from "../../Commons/utils/logger";

const getHostingDTOTopic = (acc: AmplifyAccount): string =>
  `arn:aws:sns:${acc.region}:${acc.accountId}:MeteringHostingDataTransferTopic.fifo`;

async function run({
  stage,
  region,
  rollback = false,
}: {
  stage: string;
  region: string;
  rollback?: boolean;
}) {
  const cpAcc = await controlPlaneAccount(stage as Stage, region as Region);
  const meteringAcc = await meteringAccount(stage as Stage, region as Region);
  const branchlessApps: AppDO[] = (await getApps(cpAcc)).withoutBranches;

  logger.info(`Found ${branchlessApps.length} branchless apps`);

  const sns = new SNSClient({
    region: cpAcc.region,
    credentials: getIsengardCredentialsProvider(
      cpAcc.accountId,
      "OncallOperator"
    ),
  });

  const messageBuilder = new HostingDTOMeteringMessageBuilder(cpAcc);

  for (const branchlessApp of branchlessApps) {
    const msg = messageBuilder.build({
      actionType: rollback ? "START" : "STOP",
      appId: branchlessApp.appId,
      customerAccountId: branchlessApp.accountId,
      distributionId: branchlessApp.cloudFrontDistributionId,
    });

    logger.info(`Sending SNS msg actionType=${msg.actionType} App=${msg.appArn}, Distro=${msg.resource}`);

    await sns.send(
      new PublishCommand({
        Message: JSON.stringify(msg),
        MessageGroupId: branchlessApp.cloudFrontDistributionId,
        TopicArn: getHostingDTOTopic(meteringAcc),
      })
    );
  }

  logger.info(`Successfully sent ${branchlessApps.length} messages`);
}

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        STOPS HostingDataTransferOut metering for all branch-less Apps
        
        It finds all branch-less Apps and sends corresponding STOP messages to the MeteringHostingDataTransferTopic SNS topic. 
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
    .option("rollback", {
      describe: "If present, will rollback the migration",
      type: "boolean",
      demandOption: false,
    })
    .option("mcm", {
      describe: "i.e. MCM-73116970. Used for Contingent Auth",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  process.env.ISENGARD_MCM = args.mcm;
  await run(args);
}

main().catch((e) => {
  logger.error(e);
  process.exit(1);
});
