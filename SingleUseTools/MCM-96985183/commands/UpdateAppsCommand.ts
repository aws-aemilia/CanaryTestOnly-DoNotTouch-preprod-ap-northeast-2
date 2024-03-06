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
  APP_ID_LIST_FILE_NAME,
  CUSTOM_IMAGE_ENV_VAR,
  ENV_VARS_ATTRIBUTE_NAME,
  FAILED_APPS_FILE_NAME,
  OUTPUT_DIR,
  SKIPPED_APPS_FILE_NAME,
  UPDATED_APPS_FILE_NAME,
  UPDATE_APP_CONCURRENCY,
  UPDATE_DIR,
} from "../lib";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import { Sema } from "async-sema";
import { finished } from "stream/promises";

export class UpdateAppsCommand {
  private appDAO: AppDAO;
  private stage: Stage;
  private region: Region;

  private outDir: string;
  private updatedAppsFile: string;
  private skippedAppsFile: string;
  private failedAppsFile: string;

  private updatedAppsWriteStream: WriteStream;
  private skippedAppsWriteStream: WriteStream;
  private failedAppsWriteStream: WriteStream;

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
      UPDATE_DIR
    );
    this.updatedAppsFile = path.join(this.outDir, UPDATED_APPS_FILE_NAME);
    this.skippedAppsFile = path.join(this.outDir, SKIPPED_APPS_FILE_NAME);
    this.failedAppsFile = path.join(this.outDir, FAILED_APPS_FILE_NAME);

    this.updatedAppsWriteStream = createWriteStream(this.updatedAppsFile, {
      flags: "a",
    });
    this.skippedAppsWriteStream = createWriteStream(this.skippedAppsFile, {
      flags: "a",
    });
    this.failedAppsWriteStream = createWriteStream(this.failedAppsFile, {
      flags: "a",
    });
  }

  public static async buildDefault(
    stage: Stage,
    region: Region,
    credentials: Provider<Credentials>
  ): Promise<UpdateAppsCommand> {
    return new UpdateAppsCommand({
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

      const scannedAppsFile = path.join(
        __dirname,
        "..",
        OUTPUT_DIR,
        this.stage,
        this.region,
        APP_ID_LIST_FILE_NAME
      );

      logger.info(`Reading appIds from ${scannedAppsFile}.`);

      const appIds = readFileSync(scannedAppsFile, "utf8")
        .split("\n")
        .filter((appId) => appId && !processedApps.has(appId))
        .sort(() => Math.random() - 0.5);

      logger.info(`Found ${appIds.length} appIds to update.`);

      // Initialize semaphore to limit update concurrency
      const sema = new Sema(UPDATE_APP_CONCURRENCY, {
        capacity: appIds.length,
      });

      logger.info(
        `Updating apps with a concurrency of ${UPDATE_APP_CONCURRENCY}.`
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

      logger.info(`Finished updating ${appIds.length} apps.`);
    } finally {
      this.updatedAppsWriteStream.end();
      this.skippedAppsWriteStream.end();
      this.failedAppsWriteStream.end();

      await finished(this.updatedAppsWriteStream);
      await finished(this.skippedAppsWriteStream);
      await finished(this.failedAppsWriteStream);
    }
  }

  private async processApp(appId: string) {
    try {
      await this.updateApp(appId);
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException &&
        err.message === "The conditional request failed"
      ) {
        this.skippedAppsWriteStream.write(`${appId}\n`);
      } else {
        logger.error(`Failed to update app ${appId}: ${err}`);
        this.failedAppsWriteStream.write(`${appId}\n`);
      }

      return;
    }

    this.updatedAppsWriteStream.write(`${appId}\n`);
  }

  private async updateApp(appId: string) {
    try {
      /**
       * First, we need to ensure that the environment variables map exists for the app. If it doesn't, we create it.
       */
      await this.appDAO.updateAppById(appId, {
        UpdateExpression: "SET #env_vars = :value",
        ExpressionAttributeNames: {
          "#env_vars": ENV_VARS_ATTRIBUTE_NAME,
        },
        ExpressionAttributeValues: {
          ":value": {},
        },
        ConditionExpression: "attribute_not_exists(#env_vars)",
      });
    } catch (err) {
      if (
        err instanceof ConditionalCheckFailedException &&
        err.message === "The conditional request failed"
      ) {
        // The environment variables map already exists. We can continue.
      } else {
        throw err;
      }
    }
    /**
     * Now that we have ensured that the environment variables map exists, we can update it.
     */
    await this.appDAO.updateAppById(appId, {
      UpdateExpression: `SET #env_vars.#customImage = :value`,
      ExpressionAttributeNames: {
        "#env_vars": ENV_VARS_ATTRIBUTE_NAME,
        "#customImage": CUSTOM_IMAGE_ENV_VAR,
      },
      ExpressionAttributeValues: {
        ":value": AL2_BUILD_IMAGE_URI,
      },
      ConditionExpression: `attribute_not_exists(#env_vars.#customImage)`,
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
      ...loadFile(this.updatedAppsFile),
      ...loadFile(this.skippedAppsFile),
      ...loadFile(this.failedAppsFile),
    ]);
  }
}
