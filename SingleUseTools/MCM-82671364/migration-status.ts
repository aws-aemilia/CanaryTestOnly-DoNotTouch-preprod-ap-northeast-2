import {
  LambdaEdgeConfig,
  getDynamoDBDocumentClient,
  paginateLambdaEdgeConfigs,
} from "../../Commons/dynamodb";
import { createLogger } from "../../Commons/utils/logger";
import sleep from "../../Commons/utils/sleep";
import yargs from "yargs";
import {
  Region,
  getIsengardCredentialsProvider,
  controlPlaneAccounts,
  Stage,
} from "../../Commons/Isengard";

const logger = createLogger();

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Gather migration status for Static Asset Separation

        Usage:
        npx ts-node customerimpact.ts --ticket V1234567
      `
    )
    .option("ticket", {
      describe: "Ticket for CAZ",
      type: "string",
      require: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  const stage = "prod";

  const outcomes: {
    stage: string;
    region: string;
    appCount: number;
    computeApps: number;
    staticAssetSeparatedAppCount: number;
    percentMigrated: number;
  }[] = [];

  const accounts = await controlPlaneAccounts({ stage: stage as Stage });
  const allRegionPromises = accounts.map(async (account) => {
    const region = account.region;
    const regionLogger = logger.child({ region });
    const uniqueApps = new Set<{
      appId: string;
      region: string;
      stage: string;
      isComputeApp: boolean;
      isStaticAssetSeparated: boolean;
    }>();

    regionLogger.info(
      `Starting execution for ${account.airportCode} (${account.accountId})`
    );
    const credentials = getIsengardCredentialsProvider(
      account.accountId,
      "FullReadOnly"
    );
    const ddbClient = getDynamoDBDocumentClient(region as Region, credentials);
    const pages = paginateLambdaEdgeConfigs(ddbClient, [
      "appId",
      "branchConfig",
      "customDomainIds",
    ]);

    regionLogger.info(`Paginating through lambda edge config table...`);
    for await (const page of pages) {
      for (const item of page.Items ?? []) {
        const lecItem = item as Partial<LambdaEdgeConfig>;
        uniqueApps.add({
          appId: lecItem.appId!,
          region: account.region,
          stage: account.stage,
          isComputeApp: isComputeApp(lecItem),
          isStaticAssetSeparated: isStaticAssetSeparated(lecItem),
        });
      }

      regionLogger.info("Sleeping between pages...");
      await sleep(1000);
    }

    regionLogger.info(`Found ${uniqueApps.size} unique apps in ${region}`);
    let staticAssetSeparatedAppCount = 0;
    let computeApps = 0;
    uniqueApps.forEach((app) => {
      if (app.isStaticAssetSeparated) {
        staticAssetSeparatedAppCount++;
      }
      if (app.isComputeApp) {
        computeApps++;
      }
    });
    const percentMigrated = (staticAssetSeparatedAppCount / computeApps) * 100;

    outcomes.push({
      stage,
      region,
      appCount: uniqueApps.size,
      computeApps,
      staticAssetSeparatedAppCount,
      percentMigrated,
    });
    logger.info({
      stage,
      region,
      appCount: uniqueApps.size,
      computeApps,
      staticAssetSeparatedAppCount,
      percentMigrated,
    });
  });

  await Promise.allSettled(allRegionPromises);
  console.table(outcomes);
}

function isStaticAssetSeparated(
  edgeConfig: Partial<LambdaEdgeConfig>
): boolean {
  if (!edgeConfig.branchConfig) {
    return false;
  }

  for (const branchConfig of Object.values(edgeConfig.branchConfig)) {
    if (branchConfig.version && branchConfig.version === "1") {
      return true;
    }
  }

  return false;
}

function isComputeApp(edgeConfig: Partial<LambdaEdgeConfig>): boolean {
  if (!edgeConfig.branchConfig) {
    return false;
  }

  for (const branchConfig of Object.values(edgeConfig.branchConfig)) {
    if (branchConfig.version && branchConfig.version === "1") {
      return true;
    } else if ((branchConfig as any)["computeServiceFunctionName"]) {
      return true;
    }
  }

  return false;
}

main().then(console.log).catch(console.error);
