import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  RegionName,
  Stage,
  StandardRoles,
} from "Commons/Isengard";
import { ConfigService } from "@aws-sdk/client-config-service";
import { IAM } from "@aws-sdk/client-iam";
import log from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";

const ROLE = StandardRoles.OncallOperator;
const COMMON_SERVICE_REGIONS: RegionName[] = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "sa-east-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-northeast-3",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-south-1",
];
const OPT_IN_REGIONS: RegionName[] = ["ap-east-1", "me-south-1", "eu-south-1"];

async function getArgs() {
  return yargs(hideBin(process.argv))
    .usage(
      `
      Delete AWS Config service resources in all regions for a given Control Plane account. This is needed so that the
      changes in this CR can be deployed: https://code.amazon.com/reviews/CR-115481448
      
      Example:
      ts-node cleanUpAwsConfig.ts --stage prod --region us-west-2
    `
    )
    .option("accountStage", {
      describe: `The account's stage.`,
      type: "string",
      default: "prod",
      alias: "s",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("accountRegion", {
      describe: `The account's region (e.g. pdx, PDX, us-west-2).`,
      type: "string",
      demandOption: true,
      alias: "r",
    })
    .option("deleteResources", {
      describe: "Whether to actually delete the AWS Config resources",
      type: "boolean",
      default: false,
    })
    .strict()
    .version(false)
    .help().argv as {
    accountStage: Stage;
    accountRegion: Region;
    deleteResources: boolean;
  };
}

async function deleteConfigResources(
  configService: ConfigService,
  deleteResources: boolean
) {
  const configRecorders = await configService.describeConfigurationRecorders(
    {}
  );
  const ConfigurationRecorderName =
    configRecorders.ConfigurationRecorders?.[0]?.name;

  if (deleteResources && ConfigurationRecorderName != undefined) {
    await configService.deleteConfigurationRecorder({
      ConfigurationRecorderName,
    });
    log.info(`Deleted configuration recorder ${ConfigurationRecorderName}`);
  } else {
    log.info(
      `Found configuration recorder ${ConfigurationRecorderName}, but not deleting`
    );
  }

  const deliveryChannels = await configService.describeDeliveryChannels({});
  const DeliveryChannelName = deliveryChannels.DeliveryChannels?.[0]?.name;

  if (deleteResources && DeliveryChannelName != undefined) {
    await configService.deleteDeliveryChannel({ DeliveryChannelName });
    log.info(`Deleted delivery channel ${DeliveryChannelName}`);
  } else {
    log.info(`Found delivery channel ${DeliveryChannelName}, but not deleting`);
  }
}

async function deleteIamRole(iam: IAM, deleteResources: boolean) {
  const RoleName = "AWSServiceRoleForConfig";

  if (deleteResources) {
    const deleteRole = await iam.deleteServiceLinkedRole({ RoleName });
    log.info(
      `Deleted ${RoleName} with deletion task ID: ${deleteRole.DeletionTaskId}`
    );
  }
}

async function main() {
  let { accountStage, accountRegion, deleteResources } = await getArgs();
  accountRegion = toRegionName(accountRegion);

  const account = await controlPlaneAccount(accountStage, accountRegion);
  await preflightCAZ({ accounts: account, role: ROLE });
  let credentials = getIsengardCredentialsProvider(account.accountId, ROLE);

  for (const region of COMMON_SERVICE_REGIONS) {
    const configService = new ConfigService({ credentials, region });
    await deleteConfigResources(configService, deleteResources);
  }

  if (accountRegion in OPT_IN_REGIONS) {
    const configService = new ConfigService({
      credentials,
      region: accountRegion,
    });
    await deleteConfigResources(configService, deleteResources);
  }

  const iam = new IAM({ credentials });
  await deleteIamRole(iam, deleteResources);
}

main().catch(log.error);
