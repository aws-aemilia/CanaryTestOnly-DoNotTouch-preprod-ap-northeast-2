import { PromisePool } from "@supercharge/promise-pool";
import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import {
  AhioInvocationResult,
  AhioRequest,
  HostingGatewayImageRequest,
  HostingGatewayImageRequestRegionLogs,
  Problem,
  SingleRegionResults,
} from "./types";
import { executeAhioRequest } from "./executeAhioRequest";
import { findProblemsWithAhioRequest } from "./findProblemsWithAhioRequest";
import { convertImageRequestToAhioRequest } from "./convertImageRequestToAhioRequest";
import { LambdaClient } from "@aws-sdk/client-lambda";
import { createSpinningLogger } from "../../Commons/utils/logger";
import sleep from "Commons/utils/sleep";

const logger = createSpinningLogger();
let regionsRemaining: number = 0;
let allRequests: number = 0;

export async function runRequestsInAllRegions(
  allRegionLogs: HostingGatewayImageRequestRegionLogs[],
  controlPlaneAccountsForStage: AmplifyAccount[],
  cellAccountsForStage: AmplifyAccount[],
  concurrentRequestsPerRegion: number
): Promise<SingleRegionResults[]> {
  regionsRemaining = allRegionLogs.length;
  allRequests = allRegionLogs.reduce((acc, item) => acc + item.logs.length, 0);

  logger.update(
    `Making all requests - Regions Remaining: ${regionsRemaining} - Total Requests Remaining: ${allRequests}`
  );
  logger.spinnerStart();

  const allRegionPromises = allRegionLogs.map(async (oneRegionsLogs) => {
    const controlPlaneAccountForRegion = controlPlaneAccountsForStage.find(
      (oneAccount) => oneAccount.region === oneRegionsLogs.account.region
    );

    if (!controlPlaneAccountForRegion) {
      throw new Error(
        `Could not find control plane account for region ${oneRegionsLogs.account.region}`
      );
    }

    const result = await runRequestsInSingleRegion(
      oneRegionsLogs,
      controlPlaneAccountForRegion,
      cellAccountsForStage,
      concurrentRequestsPerRegion
    );
    regionsRemaining -= 1;
    logger.update(
      `Making all requests - Regions Remaining: ${regionsRemaining} - Total Requests Remaining: ${allRequests}`
    );

    return result;
  });

  try {
    const results = await Promise.all(allRegionPromises);
    logger.spinnerStop("Completed all requests");
    return results;
  } catch (error) {
    logger.spinnerStop("Failed unexpectedly", false);
    throw error;
  }
}

async function runRequestsInSingleRegion(
  oneRegionsLogs: HostingGatewayImageRequestRegionLogs,
  controlPlaneAccountForRegion: AmplifyAccount,
  cellAccountsForStage: AmplifyAccount[],
  concurrentRequestsPerRegion: number
): Promise<SingleRegionResults> {
  const allProblems: {
    requestNumber: number;
    problems: Problem[];
    imageRequest: HostingGatewayImageRequest;
    ahioRequest: Partial<AhioRequest>;
    ahioResult?: Partial<AhioInvocationResult>;
  }[] = [];
  const allSuccesses: {
    requestNumber: number;
    imageRequest: HostingGatewayImageRequest;
    ahioRequest: Partial<AhioRequest>;
    ahioResult?: Partial<AhioInvocationResult>;
  }[] = [];

  // Use a cell account from the region corresponding to the request
  const cellAccountForRegion = cellAccountsForStage.find(
    (oneAccount) => oneAccount.region === oneRegionsLogs.account.region
  );

  if (!cellAccountForRegion) {
    throw new Error(
      `Could not find cellaccount for region ${oneRegionsLogs.account.region}`
    );
  }

  const lambdaClient = new LambdaClient({
    region: cellAccountForRegion.region,
    credentials: getIsengardCredentialsProvider(
      cellAccountForRegion.accountId,
      "LambdaInvoker"
    ),
  });

  const allRequestPromises = oneRegionsLogs.logs.map(
    async (oneLog, requestNumber) => {
      // Convert image request to AHIO request on the fly - this allows
      // presigned URLs to have the appropriate lifetime
      const ahioRequest = await convertImageRequestToAhioRequest(
        oneLog,
        controlPlaneAccountForRegion
      );

      // If nextJsCache is HIT or STALE
      //   - Make second request to AHIO
      //   - Second request allows for "Cached" request possibility
      // Make request to AHIO and capture results
      if (
        oneLog.nextCacheHeader === "HIT" ||
        oneLog.nextCacheHeader === "STALE"
      ) {
        // Execute request and throw it out to prime the cache
        await executeAhioRequest(ahioRequest, lambdaClient);
        // Wait to ensure we don't hit rate limits
        await sleep(100);
      }

      const ahioInvocationResult = await executeAhioRequest(
        ahioRequest,
        lambdaClient
      );
      // Wait to ensure we don't hit rate limits
      await sleep(100);

      // Compare outcome of Image Request and  AHIO request
      const problems = findProblemsWithAhioRequest(
        ahioInvocationResult,
        oneLog
      );
      if (problems.length === 0) {
        allSuccesses.push({
          requestNumber,
          imageRequest: oneLog,
          ahioRequest: {
            ...ahioRequest,
            // Don't log presigned urls
            presignedS3Url: "",
          },
          ahioResult: redactSensitiveInfoFromAhioResult(ahioInvocationResult),
        });
      } else {
        allProblems.push({
          problems,
          requestNumber,
          imageRequest: oneLog,
          ahioRequest: redactSensitiveInfoFromAhioRequest(ahioRequest),
          ahioResult: redactSensitiveInfoFromAhioResult(
            ahioInvocationResult,
            false
          ),
        });
      }

      allRequests -= 1;
      logger.update(
        `Making all requests - Regions Remaining: ${regionsRemaining} - Total Requests Remaining: ${allRequests}`
      );
    }
  );

  await PromisePool.withConcurrency(concurrentRequestsPerRegion)
    .for(allRequestPromises)
    // Just execute the promise
    .process((value) => value);

  return {
    region: oneRegionsLogs.account.region,
    problemCount: allProblems.length,
    successCount: allSuccesses.length,
    allProblems,
    allSuccesses,
  };
}

function redactSensitiveInfoFromAhioRequest(ahioRequest: AhioRequest) {
  let presignedUrl: URL | string = "";
  if (ahioRequest.presignedS3Url) {
    presignedUrl = new URL(ahioRequest.presignedS3Url);
    presignedUrl.search = "";
  }

  // Remove all sensitive information from the presigned url
  return {
    ...ahioRequest,
    presignedS3Url: presignedUrl.toString(),
  };
}

function redactSensitiveInfoFromAhioResult(
  ahioResult?: AhioInvocationResult,
  shouldRedactLogs: boolean = true
): AhioInvocationResult | undefined {
  if(!ahioResult) {
    return;
  }
  return {
    ...ahioResult,
    log: shouldRedactLogs ? "" : ahioResult.log,
    response: {
      statusCode: 0, // Make TS happy
      ...ahioResult.response,
      // If it's not base64 encoded, it's an error and we should log it
      body: ahioResult.response?.isBase64Encoded ? "" : ahioResult.response?.body,
    },
  };
}
