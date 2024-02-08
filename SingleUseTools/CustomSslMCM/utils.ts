import { AmplifyClient } from "@aws-sdk/client-amplify";
import logger from "Commons/utils/logger";

export const logWithDivider = (logMessage: string): void => {
  logger.info("-----------------------------");
  logger.info(logMessage);
  logger.info("-----------------------------");
};
