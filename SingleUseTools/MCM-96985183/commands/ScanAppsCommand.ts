import { Region, Stage } from "Commons/Isengard";
import { AppDAO } from "Commons/dynamodb";
import logger from "Commons/utils/logger";
import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  APP_ID_LIST_FILE_NAME,
  COMPLETION_MARKER_FILE_NAME,
  OUTPUT_DIR,
} from "../lib";
import { Credentials, Provider } from "@aws-sdk/types";
import { finished } from "stream/promises";

export class ScanAppsCommand {
  private appDAO: AppDAO;
  private stage: Stage;
  private region: Region;

  private outDir: string;

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
      this.region
    );
  }

  public static async buildDefault(
    stage: Stage,
    region: Region,
    credentials: Provider<Credentials>
  ): Promise<ScanAppsCommand> {
    return new ScanAppsCommand({
      AppDAO: new AppDAO(stage, region, credentials),
      stage,
      region,
    });
  }

  public async execute() {
    if (!existsSync(this.outDir)) {
      logger.info(`Creating output directory: ${this.outDir}`);

      mkdirSync(this.outDir, {
        recursive: true,
      });
    }

    const outputFile = path.join(this.outDir, APP_ID_LIST_FILE_NAME);
    const writeStream = this.createWriteStream(outputFile);

    try {
      logger.info("Starting scan of App table...");

      const completionMarker = path.join(
        this.outDir,
        COMPLETION_MARKER_FILE_NAME
      );

      if (existsSync(completionMarker)) {
        logger.info("Scan already completed. Skipping...");
        return;
      }

      logger.info(`Writing scanned appIds to ${outputFile}.`);

      const pages = this.appDAO.paginate(["appId"]);

      let pageCount = 0;
      let appCount = 0;

      for await (const page of pages) {
        pageCount += 1;

        const items = page.Items || [];

        logger.info(`Found ${items.length} apps in page #${pageCount}.`);

        appCount += items.length;

        for (const item of items) {
          writeStream.write(`${item.appId}\n`);
        }
      }

      logger.info("Finished scanning App table.");
      logger.info(`Found ${appCount} apps in ${pageCount} pages.`);

      logger.info(`Writing completion marker to ${completionMarker}`);
      writeFileSync(completionMarker, new Date().getTime().toString());
    } finally {
      writeStream.end();

      await finished(writeStream);
    }
  }

  private createWriteStream(filePath: string) {
    const writeStream = createWriteStream(filePath, { flags: "a" });

    writeStream.on("error", (err) => {
      logger.error(`Error writing to ${filePath}: ${err}`);
    });

    return writeStream;
  }
}
