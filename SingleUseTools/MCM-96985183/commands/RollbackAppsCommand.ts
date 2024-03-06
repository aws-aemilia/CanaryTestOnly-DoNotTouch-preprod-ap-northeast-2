import { Region, Stage } from "Commons/Isengard";
import { AppDAO } from "Commons/dynamodb";
import logger from "Commons/utils/logger";
import {
  WriteStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
} from "fs";
import path from "path";
import {
  AL2_BUILD_IMAGE_URI,
  CUSTOM_IMAGE_ENV_VAR,
  ENV_VARS_ATTRIBUTE_NAME,
  FAILED_ROLLBACK_APPS_FILE_NAME,
  OUTPUT_DIR,
  ROLLBACK_DIR,
  ROLLED_BACK_APPS_FILE_NAME,
  SKIPPED_ROLLBACK_APPS_FILE_NAME,
  UPDATED_APPS_FILE_NAME,
  ROLLBACK_APP_CONCURRENCY,
  UPDATE_DIR,
} from "../lib";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import { Sema } from "async-sema";
import { finished } from "stream/promises";

export class RollbackAppsCommand {
  private appDAO: AppDAO;
  private stage: Stage;
  private region: Region;

  private outDir: string;
  private rolledBackAppsFile: string;
  private skippedRollbackAppsFile: string;
  private failedRollbackAppsFile: string;

  private rolledBackAppsWriteStream: WriteStream;
  private skippedRollbackAppsWriteStream: WriteStream;
  private failedRollbackAppsStream: WriteStream;

  constructor({
    AppDAO,
    stage,
    region,
  }: {
    AppDAO: AppDAO;
    stage: Stage;
    region: Region;
  }) {
    this.appDAO = AppDAO;
    this.stage = stage;
    this.region = region;

    this.outDir = path.join(
      __dirname,
      "..",
      OUTPUT_DIR,
      this.stage,
      this.region,
      ROLLBACK_DIR
    );
    this.rolledBackAppsFile = path.join(
      this.outDir,
      ROLLED_BACK_APPS_FILE_NAME
    );
    this.skippedRollbackAppsFile = path.join(
      this.outDir,
      SKIPPED_ROLLBACK_APPS_FILE_NAME
    );
    this.failedRollbackAppsFile = path.join(
      this.outDir,
      FAILED_ROLLBACK_APPS_FILE_NAME
    );

    this.rolledBackAppsWriteStream = createWriteStream(
      this.rolledBackAppsFile,
      {
        flags: "a",
      }
    );
    this.skippedRollbackAppsWriteStream = createWriteStream(
      this.skippedRollbackAppsFile,
      {
        flags: "a",
      }
    );
    this.failedRollbackAppsStream = createWriteStream(
      this.failedRollbackAppsFile,
      {
        flags: "a",
      }
    );
  }

  public static async buildDefault(
    stage: Stage,
    region: Region,
    credentials: Provider<Credentials>
  ): Promise<RollbackAppsCommand> {
    return new RollbackAppsCommand({
      AppDAO: new AppDAO(stage, region, credentials),
      stage,
      region,
    });
  }

  public async execute(appId?: string) {
    if (!existsSync(this.outDir)) {
      logger.info(`Creating output directory: ${this.outDir}`);

      mkdirSync(this.outDir, {
        recursive: true,
      });
    }

    try {
      const processedApps = this.getProcessedApps();

      if (appId) {
        if (processedApps.has(appId)) {
          logger.info(`App ${appId} has already been processed.`);
          return;
        }

        await this.processApp(appId);

        return;
      }

      const updatedAppsFile = path.join(
        __dirname,
        "..",
        OUTPUT_DIR,
        this.stage,
        this.region,
        UPDATE_DIR,
        UPDATED_APPS_FILE_NAME
      );

      if (!existsSync(updatedAppsFile)) {
        throw new Error(
          `Updated apps file does not exist: ${updatedAppsFile}. Please run <brazil-build MCM-96985183-execute --stage ${this.stage} --region ${this.region}> first before attempting to rollback`
        );
      }

      logger.info(`Reading appIds from ${updatedAppsFile}.`);

      const appIds = readFileSync(updatedAppsFile, "utf8")
        .split("\n")
        .filter((appId) => appId && !processedApps.has(appId))
        .sort(() => Math.random() - 0.5);

      logger.info(`Found ${appIds.length} appIds to roll back.`);

      // Initialize semaphore to limit rollback concurrency
      const sema = new Sema(ROLLBACK_APP_CONCURRENCY, {
        capacity: appIds.length,
      });

      logger.info(
        `Rolling back apps with a concurrency of ${ROLLBACK_APP_CONCURRENCY}.`
      );

      let appCount = 0;

      const promises = appIds.map(async (appId) => {
        try {
          // Acquire a semaphore token to limit concurrency
          await sema.acquire();
          await this.processApp(appId);

          appCount += 1;

          if (appCount % 1000 === 0) {
            logger.info(
              `Processed ${appCount} apps. ${
                appIds.length - appCount
              } remaining.`
            );
          }
        } finally {
          // Release the semaphore token
          sema.release();
        }
      });

      try {
        await Promise.all(promises);
      } finally {
        // Drain the semaphore to ensure all tokens are released
        await sema.drain();
      }

      logger.info(`Finished rolling back ${appIds.length} apps.`);
    } finally {
      this.rolledBackAppsWriteStream.end();
      this.skippedRollbackAppsWriteStream.end();
      this.failedRollbackAppsStream.end();

      await finished(this.rolledBackAppsWriteStream);
      await finished(this.skippedRollbackAppsWriteStream);
      await finished(this.failedRollbackAppsStream);
    }
  }

  private async processApp(appId: string) {
    try {
      await this.rollbackApp(appId);
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException &&
        err.message === "The conditional request failed"
      ) {
        logger.warn(`Skipping rollback of app ${appId}.`);
        this.skippedRollbackAppsWriteStream.write(`${appId}\n`);
      } else {
        logger.error(`Failed to rollback app ${appId}: ${err}`);
        this.failedRollbackAppsStream.write(`${appId}\n`);
      }

      return;
    }

    this.rolledBackAppsWriteStream.write(`${appId}\n`);
  }

  private async rollbackApp(appId: string) {
    return this.appDAO.updateAppById(appId, {
      UpdateExpression: `REMOVE #env_vars.#customImage`,
      ExpressionAttributeNames: {
        "#env_vars": ENV_VARS_ATTRIBUTE_NAME,
        "#customImage": CUSTOM_IMAGE_ENV_VAR,
      },
      ExpressionAttributeValues: {
        ":value": AL2_BUILD_IMAGE_URI,
      },
      ConditionExpression:
        "attribute_exists(#env_vars) and attribute_exists(#env_vars.#customImage) and #env_vars.#customImage = :value",
    });
  }

  private getProcessedApps() {
    const loadFile = (filePath: string) => {
      if (existsSync(filePath)) {
        return readFileSync(filePath, "utf8").split("\n");
      }
      return [];
    };

    return new Set<string>([
      ...loadFile(this.rolledBackAppsFile),
      ...loadFile(this.skippedRollbackAppsFile),
      ...loadFile(this.failedRollbackAppsFile),
    ]);
  }
}
