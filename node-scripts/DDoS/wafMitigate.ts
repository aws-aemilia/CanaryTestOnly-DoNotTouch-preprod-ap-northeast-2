import { AmplifyAccount, controlPlaneAccount, getIsengardCredentialsProvider, Region, Stage, } from "../Isengard";
import { doQuery } from "../libs/CloudWatch";
import { getCloudFormationResources } from "../utils/cloudFormation";
import logger from "../utils/logger";
import { CreateWebACLCommand, CreateWebACLCommandOutput, Scope, WAFV2Client, } from "@aws-sdk/client-wafv2";
import { CloudFrontClient, GetDistributionConfigCommand, NoSuchDistribution, } from "@aws-sdk/client-cloudfront";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { updateDistribution } from "../utils/cloudfront";
import { defaultWafRules } from "./defaultWafRules";

require("util").inspect.defaultOptions.depth = null;

const minutesAgo = (n: number) =>
  new Date(new Date().getTime() - 60 * 1000 * n);

async function getLogGroupName(account: AmplifyAccount) {
  const resources = await getCloudFormationResources({
    amplifyAccount: account,
    stackName: "AemiliaControlPlaneLambda",
    logicalResourceIds: ["DDoSAttackMitigatorFunction"],
  });

  if (!resources.DDoSAttackMitigatorFunction) {
    throw new Error("Unable to find DDoSAttackMitigatorFunction");
  }

  return `/aws/lambda/${resources.DDoSAttackMitigatorFunction}`;
}

const queryRecentDDoSEvents: (
  acc: AmplifyAccount
) => Promise<{ distributionId: string; appId: string }[]> = async (
  acc: AmplifyAccount
) => {
  const logGroup = await getLogGroupName(acc);

  const query = `
fields @timestamp, appId, distributionId
| filter CacheBehaviorUpdated = 1
 `;

  const queryResult: string[] | undefined = await doQuery(
    acc,
    logGroup,
    query,
    minutesAgo(15),
    new Date()
  );

  if (queryResult === undefined) {
    return [];
  }

  return queryResult.map((r) => {
    const parts = r.split(",");
    return {
      appId: parts[1],
      distributionId: parts[2],
    };
  });
};

async function createWaf(
  acc: AmplifyAccount,
  distributionId: string
): Promise<CreateWebACLCommandOutput> {
  const wafClient = new WAFV2Client({
    region: "us-east-1",
    credentials: getIsengardCredentialsProvider(
      acc.accountId,
      "OncallOperator"
    ),
  });

  const createWebACLCommand = new CreateWebACLCommand({
    DefaultAction: { Allow: {} },
    Name: `DDOS_ACL_${distributionId}`,
    Scope: Scope.CLOUDFRONT,
    VisibilityConfig: {
      SampledRequestsEnabled: true,
      CloudWatchMetricsEnabled: true,
      MetricName: "WebAclMetrics",
    },
    Rules: defaultWafRules,
  });

  return await wafClient.send(createWebACLCommand);
}

async function attachWaf(
  acc: AmplifyAccount,
  webACLId: string,
  distributionId: string
) {
  const client = new CloudFrontClient({
    region: "us-east-1",
    credentials: getIsengardCredentialsProvider(
      acc.accountId,
      "OncallOperator"
    ),
  });
  await updateDistribution({
    cloudFrontClient: client,
    distributionId: distributionId,
    updateDistributionConfigFn: (distributionConfig) => {
      distributionConfig.WebACLId = webACLId;
      return distributionConfig;
    },
  });
}

async function getDDoSAppFromLogs(
  acc: AmplifyAccount
): Promise<{ distributionId: string; appId: string }> {
  const recentDDoSEvents = await queryRecentDDoSEvents(acc);
  if (recentDDoSEvents.length === 0) {
    throw new Error("No recent DDoS events");
  }

  if (recentDDoSEvents.length > 1) {
    logger.info(recentDDoSEvents);
    throw new Error("There are multiple recent DDoS events. This tool only operates on a single distribution. Run the tool using --distributionId");
  }
  return recentDDoSEvents[0];
}

async function main() {

  const args = await yargs(hideBin(process.argv))
      .usage(
          `
        Creates a WAF web ACL and attaches it to the distribution that was hit by a DDoS attack. The web ACL initially
        uses an IP reputation list to block botnet traffic, and a rate-based rule to allow up to 2,000 requests per
        5 minutes.
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
        describe: "Target distributionId. If not provided, will find the distributionId from the logs",
        type: "string",
        demandOption: false,
      })
      .strict()
      .version(false)
      .help().argv;

  const {stage, region, distributionId, ticket} = args;

  process.env.ISENGARD_SIM = ticket;

  const acc = await controlPlaneAccount(stage as Stage, region as Region);

  const cloudFrontClient = new CloudFrontClient({
    region: "us-east-1",
    credentials: getIsengardCredentialsProvider(
      acc.accountId,
      "OncallOperator"
    ),
  });

  let targetDistributionId: string

  if (distributionId) {
    logger.info(distributionId, "Using provided distributionId");
    targetDistributionId = distributionId;
  } else {
    logger.info(
        "querying the logs to find the distributionId from recent DDoS mitigation events"
    );
    const ddosEvent = await getDDoSAppFromLogs(acc);
    logger.info(ddosEvent, "Found DDoS event in the logs");
    targetDistributionId = ddosEvent.distributionId;
  }

  logger.info(`Checking if distribution ${targetDistributionId} exists`);

  try {
    await cloudFrontClient.send(
        new GetDistributionConfigCommand({ Id: targetDistributionId })
    );
  } catch (e) {
    if (e instanceof NoSuchDistribution){
      logger.error(`ERROR: The distribution ${targetDistributionId} does not exist`);
      if (distributionId){
        logger.error(`You provided the --distributionId param. Double check that you used the correct distributionId, region, and stage`);
      }
      logger.error(`The most likely cause is that the customer already deleted the App or Custom Domain. You can query the logs to confirm: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/ControlPlane/#HCheckifaDistributionwasdeleted`);
      return;
    }
    throw e;
  }

  logger.info(`Applying WAF to ${targetDistributionId}`);
  const createWAFOutput = await createWaf(acc, targetDistributionId);
  await attachWaf(acc, createWAFOutput.Summary!.ARN!, targetDistributionId);
  logger.info("WAF created and attached to distribution");
  logger.info(createWAFOutput.Summary);

  logger.info("Success!!! All mitigation steps are complete")
}

main().then(console.log).catch(console.error);
