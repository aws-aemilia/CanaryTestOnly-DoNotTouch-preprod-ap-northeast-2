export const COMPLETION_MARKER_FILE_NAME = ".completed_scan";
export const APP_ID_LIST_FILE_NAME = "appIds.txt";

export const OUTPUT_DIR = "output";
export const VERIFY_DIR = "verify";
export const ROLLBACK_DIR = "rollback";
export const UPDATE_DIR = "update";

export const UPDATED_APPS_FILE_NAME = "updatedApps.txt";
export const SKIPPED_APPS_FILE_NAME = "skippedApps.txt";
export const FAILED_APPS_FILE_NAME = "failedApps.txt";

export const VERIFIED_APPS_FILE_NAME = "verifiedApps.txt";
export const UNVERIFIED_APPS_FILE_NAME = "unverifiedApps.txt";

export const ROLLED_BACK_APPS_FILE_NAME = "rolledBackApps.txt";
export const SKIPPED_ROLLBACK_APPS_FILE_NAME = "skippedRollbackApps.txt";
export const FAILED_ROLLBACK_APPS_FILE_NAME = "failedRollbackApps.txt";

export const ENV_VARS_ATTRIBUTE_NAME = "environmentVariables";
export const CUSTOM_IMAGE_ENV_VAR = "_CUSTOM_IMAGE";
export const AL2_BUILD_IMAGE_URI = "amplify:al2";

export enum UNVERIFIED_REASON {
  APP_DELETED = "APP_DELETED",
  NO_ENV_VARS = "NO_ENV_VARS",
  NO_CUSTOM_IMAGE_ENV_VAR = "NO_CUSTOM_IMAGE_ENV_VAR",
  CUSTOM_IMAGE_ENV_VAR_NOT_SET_TO_AL2 = "CUSTOM_IMAGE_ENV_VAR_NOT_SET_TO_AL2",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export const GENIE_BASE_URL = "https://genie.console.amplify.aws.a2z.com";

/**
 * Tested in beta with 300,000 update operations. WCU stayed steadily at 1600.
 *
 * Time taken to process 300,000 apps: 800 seconds
 */
export const UPDATE_APP_CONCURRENCY = 2000;

/**
 * Tested in beta with 300,000 rollback operations. RCU stayed steadily at 1600.
 *
 * Time taken to process 300,000 apps: 400 seconds
 */
export const ROLLBACK_APP_CONCURRENCY = 2000;

/**
 * Tested in beta with 300,000 verification operations. RCU stayed steadily at 350.
 *
 * Time taken to process 300,000 apps: 480 seconds
 */
export const VERIFY_APP_CONCURRENCY = 2000;
