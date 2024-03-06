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
  VERIFY_APP_CONCURRENCY,
  OUTPUT_DIR,
  UNVERIFIED_APPS_FILE_NAME,
  UNVERIFIED_REASON,
  UPDATED_APPS_FILE_NAME,
  UPDATE_DIR,
  VERIFIED_APPS_FILE_NAME,
  VERIFY_DIR,
} from "../lib";
import { Credentials, Provider } from "@aws-sdk/types";
import { Sema } from "async-sema";
import { finished } from "stream/promises";

export class VerifyAppsCommand {
  private appDAO: AppDAO;
  private stage: Stage;
  private region: Region;

  private outDir: string;
  private verifiedAppsFile: string;
  private unverifiedAppsFile: string;

  private verifiedAppsWriteStream: WriteStream;
  private unverifiedAppsWriteStream: WriteStream;

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
      VERIFY_DIR
    );
    this.verifiedAppsFile = path.join(this.outDir, VERIFIED_APPS_FILE_NAME);
    this.unverifiedAppsFile = path.join(this.outDir, UNVERIFIED_APPS_FILE_NAME);

    this.verifiedAppsWriteStream = createWriteStream(this.verifiedAppsFile, {
      flags: "a",
    });
    this.unverifiedAppsWriteStream = createWriteStream(
      this.unverifiedAppsFile,
      {
        flags: "a",
      }
    );
  }

  public static async buildDefault(
    stage: Stage,
    region: Region,
    credentials: Provider<Credentials>
  ): Promise<VerifyAppsCommand> {
    return new VerifyAppsCommand({
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

        await this.verifyApp(appId);
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
          `Updated apps file does not exist: ${updatedAppsFile}. Please run the UpdateAppsCommand first before attempting to verify`
        );
      }

      logger.info(`Reading appIds from ${updatedAppsFile}.`);

      const appIds = readFileSync(updatedAppsFile, "utf8")
        .split("\n")
        .filter((appId) => appId && !processedApps.has(appId))
        .sort(() => Math.random() - 0.5);

      logger.info(`Found ${appIds.length} appIds to verify.`);

      // Initialize semaphore to limit get concurrency
      const sema = new Sema(VERIFY_APP_CONCURRENCY, {
        capacity: appIds.length,
      });

      logger.info(
        `Verifying apps with a concurrency of ${VERIFY_APP_CONCURRENCY}.`
      );

      let appCount = 0;

      const promises = appIds.map(async (appId) => {
        try {
          // Acquire a semaphore token to limit concurrency
          await sema.acquire();
          await this.verifyApp(appId);

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

      logger.info(`Finished verifying ${appIds.length} apps.`);
    } finally {
      this.verifiedAppsWriteStream.end();
      this.unverifiedAppsWriteStream.end();

      await finished(this.verifiedAppsWriteStream);
      await finished(this.unverifiedAppsWriteStream);
    }
  }

  private async verifyApp(appId: string) {
    try {
      const app = await this.appDAO.getAppById(appId, ["environmentVariables"]);

      if (!app) {
        const reason = UNVERIFIED_REASON.APP_DELETED;
        this.unverifiedAppsWriteStream.write(`${appId},${reason}\n`);
        return;
      }

      if (!app.environmentVariables) {
        const reason = UNVERIFIED_REASON.NO_ENV_VARS;
        this.unverifiedAppsWriteStream.write(`${appId},${reason}\n`);
        return;
      }

      const customImageEnvVarName = Object.keys(app.environmentVariables).find(
        (envVarName) => envVarName === CUSTOM_IMAGE_ENV_VAR
      );

      if (!customImageEnvVarName) {
        const reason = UNVERIFIED_REASON.NO_CUSTOM_IMAGE_ENV_VAR;
        this.unverifiedAppsWriteStream.write(`${appId},${reason}\n`);
        return;
      }

      if (
        app.environmentVariables[customImageEnvVarName] !== AL2_BUILD_IMAGE_URI
      ) {
        const reason = UNVERIFIED_REASON.CUSTOM_IMAGE_ENV_VAR_NOT_SET_TO_AL2;
        this.unverifiedAppsWriteStream.write(`${appId},${reason}\n`);
        return;
      }

      this.verifiedAppsWriteStream.write(`${appId}\n`);
    } catch (err) {
      logger.error(`Failed to verify app ${appId}: ${err}`);

      const reason = UNVERIFIED_REASON.INTERNAL_ERROR;
      this.unverifiedAppsWriteStream.write(`${appId},${reason}\n`);
    }
  }

  private getProcessedApps() {
    const loadFile = (filePath: string, hasReason = false) => {
      if (existsSync(filePath)) {
        const lines = readFileSync(filePath, "utf8").split("\n");

        if (!hasReason) {
          return lines;
        }

        return lines.map((line) => {
          const [appId] = line.split(",");
          return appId;
        });
      }
      return [];
    };

    return new Set<string>([
      ...loadFile(this.verifiedAppsFile),
      ...loadFile(this.unverifiedAppsFile, true),
    ]);
  }
}
