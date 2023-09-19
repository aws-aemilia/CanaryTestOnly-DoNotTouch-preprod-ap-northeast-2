import {
  AmplifyAccount,
  StandardRoles,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { Log, insightsQuery } from "../../Commons/libs/CloudWatch";
import { createSpinningLogger } from "../../Commons/utils/logger";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  AhioTrafficReplayArgs,
  HostingGatewayImageRequest,
  HostingGatewayImageRequestRegionLogs,
} from "./types";

const IMAGE_REQUEST_LOG_GROUP_PREFIX = "HostingGateway/ApplicationLogs";
const IMAGE_REQUEST_INSIGHTS_QUERY = `fields accept_header, active_job_id, app_id, branch_name, cache_contol_header, content_disposition_header, content_length_header, content_type_header, etag_header, next_cache_header, time_taken_ms, uri, vary_header
| filter @message like /Image request detected/`;

const logger = createSpinningLogger();

export async function getImageRequestsFromHgLogs(
  accounts: AmplifyAccount[],
  args: AhioTrafficReplayArgs
): Promise<HostingGatewayImageRequestRegionLogs[]> {
  let regionsLeftToGetLogsFrom = accounts.length;
  logger.update(
    `Fetching global query results. Regions remaining: ${regionsLeftToGetLogsFrom}`
  );
  logger.spinnerStart();
  const allRegionLogs: HostingGatewayImageRequestRegionLogs[] = [];
  const queryPromises = accounts.map(async (account) => {
    logger.info(account, "Beginning query for region");
    const cloudwatchClient = new CloudWatchLogsClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        StandardRoles.ReadOnly
      ),
    });
    const logs = await insightsQuery(
      cloudwatchClient,
      IMAGE_REQUEST_LOG_GROUP_PREFIX,
      IMAGE_REQUEST_INSIGHTS_QUERY,
      args.startDate,
      args.endDate,
      logger
    );

    allRegionLogs.push({
      account,
      logs: logs.map(convertLogLineToTrafficReplayLog),
    });
  });

  try {
    await Promise.all(queryPromises);
    logger.spinnerStop("Completed queries");
  } catch (error) {
    logger.error(error, "Failed to execute global query");
    logger.spinnerStop("Failed global query", false);
  }

  return allRegionLogs;
}

function convertLogLineToTrafficReplayLog(
  log: Log
): HostingGatewayImageRequest {
  return {
    acceptHeader: stripStartingAndEndingQuotesIfNeeded(log["accept_header"]),
    activeJobId: log["active_job_id"],
    appId: log["app_id"],
    branchName: log["branch_name"],
    cacheContolHeader: stripStartingAndEndingQuotesIfNeeded(
      log["cache_contol_header"]
    ),
    contentDispositionHeader: stripStartingAndEndingQuotesIfNeeded(
      log["content_disposition_header"]
    ),
    contentLengthHeader: parseInt(
      stripStartingAndEndingQuotesIfNeeded(log["content_length_header"])
    ),
    contentTypeHeader: stripStartingAndEndingQuotesIfNeeded(
      log["content_type_header"]
    ),
    etagHeader: stripStartingAndEndingQuotesIfNeeded(log["etag_header"]),
    nextCacheHeader: stripStartingAndEndingQuotesIfNeeded(
      log["next_cache_header"]
    ),
    timeTakenMs: parseInt(log["time_taken_ms"]),
    uri: log["uri"],
    varyHeader: stripStartingAndEndingQuotesIfNeeded(log["vary_header"]),
  };
}

function stripStartingAndEndingQuotesIfNeeded(data: string) {
  if (data === undefined) {
    return "";
  }

  if (data.startsWith('"') && data.endsWith('"')) {
    return data.slice(1, -1);
  }
  return data;
}
