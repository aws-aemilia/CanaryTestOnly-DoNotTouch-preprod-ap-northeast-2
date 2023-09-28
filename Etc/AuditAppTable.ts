import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { createLogger } from "Commons/utils/logger";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import { AppDO } from "../Commons/dynamodb";
import { AppDAO } from "../Commons/dynamodb/tables/AppDAO";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "../Commons/Isengard";

const logger = createLogger();

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Simple tool to scan through App table
npx ts-node Etc/AuditAppTable.ts --stage=prod --region="us-west-2"
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      default: "us-east-1",
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage } = args;

  let controlplaneCredentials: Provider<AwsCredentialIdentity> | undefined;

  // Test accounts should use ada credentials update --account --role
  if (stage !== "test") {
    const cpAccount = await controlPlaneAccount(
      stage as Stage,
      region as Region
    );

    await preflightCAZ({
      accounts: cpAccount,
      role: [StandardRoles.FullReadOnly],
    });

    controlplaneCredentials = getIsengardCredentialsProvider(
      cpAccount.accountId,
      StandardRoles.FullReadOnly
    );
  }

  const appDAO = new AppDAO(stage, region, controlplaneCredentials);
  const filename = path.join(
    __dirname,
    "..",
    "tmp",
    `${Date.now()}-AppTableAnalysis-${stage}-${region}.txt`
  );

  let webAppsCount = 0;
  let webDynamicAppsCount = 0;
  let computeAppsCount = 0;

  for await (let page of appDAO.paginate(["appId", "platform"])) {
    const appDOs = page.Items as AppDO[] | undefined;
    if (!appDOs) {
      logger.info("No more items found in the page");
      break;
    }

    for (let appDO of appDOs) {
      switch (appDO.platform) {
        case "WEB":
          webAppsCount++;
          break;
        case "WEB_COMPUTE":
          computeAppsCount++;
          break;
        case "WEB_DYNAMIC":
          webDynamicAppsCount++;
          break;
      }
      fs.appendFileSync(filename, `${appDO.appId},${appDO.platform}\n`);
    }
  }

  logger.info(region, webAppsCount, webDynamicAppsCount, computeAppsCount);
};

main()
  .then()
  .catch((e) => {
    logger.error(e);
    process.exit(1);
  });
