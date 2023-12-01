import {
  CloudFrontClient,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { AdaptiveRetryStrategy } from "@aws-sdk/middleware-retry";
import {
  Region,
  Stage,
  StandardRoles,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  kinesisConsumerAccount,
} from "Commons/Isengard";
import {
  CloudFrontOperationsDAO,
  CloudFrontOperationsDO,
} from "Commons/dynamodb";
import { Log, insightsQuery } from "Commons/libs/CloudWatch";
import logger from "Commons/utils/logger";
import dayjs from "dayjs";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { Query, QueryConfig } from "./batchQuery";
import { ConcurrentTaskRunner } from "Commons/utils/concurrent-runner";

type QueryMetadata = {
  appId: string;
  distributionId: string;
  migrationCompleted: string;
  interval: "before" | "after";
};

type Stats = {
  RequestCount2xx: number;
  RequestCount3xx: number;
  RequestCount4xx: number;
  Rate4xx: number;
  RequestCount5xx: number;
  Rate5xx: number;
  RequestCountTotal: number;
};

export class MigratedAppsQuery implements QueryConfig<QueryMetadata> {
  private records: Record<string, Stats> = {};
  private region: Region;
  private stage: Stage;
  private appIds: string[];
  private interval: number;

  constructor(
    region: Region,
    stage: Stage,
    appIds: string[],
    interval: number
  ) {
    this.region = region;
    this.stage = stage;
    this.appIds = appIds;
    this.interval = interval;
  }

  async execute(): Promise<void> {
    logger.info(`
Running MigratedAppsQuery for
  region: ${this.region}
  stage: ${this.stage}
  appIds: ${this.appIds}
  `);

    const session = new Date().toISOString();
    const queries = await this.getQueries();
    const tasks = queries.map((q) => ({
      run: () =>
        this.runQuery(q).then((logs) => this.handleLogs(q, logs, session)),
      key: q.account.accountId,
    }));

    const concurrentRunner = new ConcurrentTaskRunner(30);
    await concurrentRunner.run(tasks);
  }

  async runQuery({
    account,
    role,
    logGroupPrefix,
    query,
    startEndDate,
  }: Query<QueryMetadata>) {
    console.info(account.accountId, "Beginning query for region");
    const cloudwatchClient = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(account.accountId, role),
      retryStrategy: new AdaptiveRetryStrategy(() => Promise.resolve(100), {
        retryDecider: (error) => {
          // Check if the error is a 5xx or a ThrottlingException
          return !!(
            error.name.includes("Throttling") ||
            (error.$metadata?.httpStatusCode &&
              error.$metadata.httpStatusCode >= 500)
          );
        },
      }),
    });

    return insightsQuery(
      cloudwatchClient,
      logGroupPrefix,
      query,
      new Date(startEndDate[0]),
      new Date(startEndDate[1]),
      logger
    );
  }

  async getQueries(): Promise<Query<QueryMetadata>[]> {
    const logGroupPrefix = `/aws/fargate/AmplifyHostingKinesisConsumer-${capitalizeFirst(
      this.stage
    )}/application.log`;

    const role = StandardRoles.ReadOnly;
    const account = await kinesisConsumerAccount(this.stage, this.region);

    const cpAccount = await controlPlaneAccount(this.stage, this.region);
    const credentials = getIsengardCredentialsProvider(
      cpAccount.accountId,
      role
    );

    const cloudFrontOperationsDAO = new CloudFrontOperationsDAO(
      this.stage,
      cpAccount.region,
      credentials
    );

    const client = new CloudFrontClient({
      credentials,
    });

    const appDistributions = [];
    for await (const page of cloudFrontOperationsDAO.paginate()) {
      const items = (page.Items || []) as CloudFrontOperationsDO[];

      for (const operation of items) {
        if (
          operation.operation.operationKind != "MIGRATE_TO_GATEWAY" ||
          operation.status != "COMPLETED"
        ) {
          continue;
        }

        if (
          this.appIds.length > 0 &&
          !this.appIds.includes(operation.operation.appId)
        ) {
          continue;
        }

        appDistributions.push({
          appId: operation.operation.appId,
          distributionId: operation.operation.distributionId,
          completed: operation.lastUpdatedTimestamp,
        });
      }
    }

    const allQueries: Query<QueryMetadata>[] = [];
    for (const migration of appDistributions) {
      let distributionDomain;

      try {
        distributionDomain = await getDistributionDomain(
          client,
          migration.distributionId
        );

        const migrationCompleted = dayjs(migration.completed);

        const query = `filter \`x-host-header\` = '${distributionDomain}' and \`appId\` = '${migration.appId}'
          | stats count(*) as requests by \`sc-status\` as status, appId, accountId`;

        allQueries.push({
          account,
          role,
          logGroupPrefix,
          query,
          startEndDate: [
            migrationCompleted.subtract(this.interval, "day").toISOString(),
            migrationCompleted.toISOString(),
          ],
          metadata: {
            appId: migration.appId,
            distributionId: migration.distributionId,
            migrationCompleted: migrationCompleted.toISOString(),
            interval: "before",
          } as QueryMetadata,
        });
        allQueries.push({
          account,
          role,
          logGroupPrefix,
          query,
          startEndDate: [
            migrationCompleted.toISOString(),
            migrationCompleted.add(this.interval, "day").toISOString(),
          ],
          metadata: {
            appId: migration.appId,
            distributionId: migration.distributionId,
            migrationCompleted: migrationCompleted.toISOString(),
            interval: "after",
          } as QueryMetadata,
        });
      } catch (ex) {
        logger.error({ ex, migration });
      }
    }

    return allQueries;
  }

  async handleLogs(query: Query<QueryMetadata>, logs: Log[], session: string) {
    logger.info(`Handling logs for ${query.metadata?.appId}`);

    const stats: Stats = {
      RequestCount2xx: 0,
      RequestCount3xx: 0,
      RequestCount4xx: 0,
      Rate4xx: 0,
      RequestCount5xx: 0,
      Rate5xx: 0,
      RequestCountTotal: 0,
    };

    for (const l of logs) {
      if (l.status.startsWith("2")) {
        stats.RequestCount2xx += parseInt(l.requests, 10);
      }

      if (l.status.startsWith("3")) {
        stats.RequestCount3xx += parseInt(l.requests, 10);
      }

      if (l.status.startsWith("4")) {
        stats.RequestCount4xx += parseInt(l.requests, 10);
      }

      if (l.status.startsWith("5")) {
        stats.RequestCount5xx += parseInt(l.requests, 10);
      }
    }

    stats.RequestCountTotal =
      stats.RequestCount2xx +
      stats.RequestCount3xx +
      stats.RequestCount4xx +
      stats.RequestCount5xx;
    if (stats.RequestCountTotal > 0) {
      stats.Rate4xx = stats.RequestCount4xx / stats.RequestCountTotal;
      stats.Rate5xx = stats.RequestCount5xx / stats.RequestCountTotal;
    }

    this.records[
      `${query.metadata?.appId}|${query.metadata?.distributionId}|${query.metadata?.interval}`
    ] = stats;

    const beforeStats =
      this.records[
        `${query.metadata?.appId}|${query.metadata?.distributionId}|before`
      ];
    const afterStats =
      this.records[
        `${query.metadata?.appId}|${query.metadata?.distributionId}|after`
      ];

    if (!beforeStats || !afterStats) {
      return;
    }

    const data = {
      appId: query.metadata?.appId,
      distributionId: query.metadata?.distributionId,
      interval: this.interval,
      Rate4xxDiff: afterStats.Rate4xx - beforeStats.Rate4xx,
      Rate5xxDiff: afterStats.Rate5xx - beforeStats.Rate5xx,
      RequestCount4xxBefore: beforeStats.RequestCount4xx,
      RequestCount4xxAfter: afterStats.RequestCount4xx,
      RequestCount5xxBefore: beforeStats.RequestCount5xx,
      RequestCount5xxAfter: afterStats.RequestCount5xx,
      RequestCountBefore: beforeStats.RequestCountTotal,
      RequestCountAfter: afterStats.RequestCountTotal,
    };

    const groupDir =
      data.Rate4xxDiff > 0 || data.Rate5xxDiff ? "increased" : "decreased";

    logger.info(data, "Collected stats");
    const directory = path.join(
      __dirname,
      "..",
      "tmp",
      "migrated-ssr-v1-apps",
      groupDir
    );

    const filename = path.join(
      directory,
      `${query.metadata?.appId}-${query.metadata?.distributionId}-${session}.csv`
    );

    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    if (!fs.existsSync(filename)) {
      fs.writeFileSync(filename, "");
    }

    fs.appendFileSync(filename, JSON.stringify(data, null, 2));

    logger.info(`See output file ${filename}`);
  }
}

const getDistributionDomain = async (
  client: CloudFrontClient,
  distributionId: string
): Promise<string> => {
  const res = await client.send(
    new GetDistributionCommand({
      Id: distributionId,
    })
  );

  if (!res.Distribution?.DomainName) {
    throw new Error("Could not get distribution domain name");
  }

  return res.Distribution?.DomainName;
};

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/*
  This ops tool returns error and fault rates for specific apps and associated custom domains before and after migration.

  Example for how to run it

  npm run migrated-apps-query -- \
    --stage prod \
    --interval 1 \
    --region ca-central-1 \
    --appIds appIdAppId50 appIdAppId60

  The outputs will be a JSON file for each appId and distributionId combination in the tmp/migrated-ssr-v1-apps directory.
  The outputs are grouped into two directories, increased and decreased, depending on whether the error and fault rates increased or decreased after migration.
*/

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Takes a list of appIds and domainIds from a text file and finds the corresponding
        customer account ID in the DynamoDB App table. 
      `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("appIds", {
      string: true,
      describe:
        "list of appIds to query, if none provided, all apps will be queried",
      type: "array",
      demandOption: false,
    })
    .option("interval", {
      describe: "The interval in days before or after migration to be compared",
      type: "number",
      default: 1,
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { interval, appIds, stage, region } = args;
  const migratedAppsQuery = new MigratedAppsQuery(
    region as Region,
    stage as Stage,
    appIds || [],
    interval
  );

  migratedAppsQuery.execute();
};

main()
  .then()
  .catch((e) => {
    logger.info("\nSomething went wrong");
    logger.info(e);
  });
