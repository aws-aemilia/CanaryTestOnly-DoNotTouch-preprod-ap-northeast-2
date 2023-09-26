import {
  AmplifyCloudFrontBrokerClient,
  MigrateAppToGatewayCommand,
  waitUntilOperationCompleted,
} from "@amzn/aws-amplify-cloudfrontbroker-typescript-client";
import yargs from "yargs";

import {
  Region,
  Stage,
  StandardRoles,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "Commons/Isengard";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import logger from "Commons/utils/logger";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Migrate application to HostingGateway. This script sends a request to CloudFrontBroker to queue the app migration.

      Usage:
      
      npx ts-node OpsTools/HostingDataplaneDistributions/migrateToGateway.ts --stage prod --region us-west-2 --appId d302wq0kjlxqv1
      `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })

    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "i.e. d302wq0kjlxqv1",
      type: "string",
      demandOption: true,
    })
    .option("skipWait", {
      describe: "Skip waiting for distribution deployment to be completed.",
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = args.region as Region;
  const { appId, skipWait } = args;

  const account = await controlPlaneAccount(stage, region);

  await preflightCAZ({ accounts: account, role: StandardRoles.OncallOperator });

  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    StandardRoles.OncallOperator
  );

  const appDAO = new AppDAO(stage, region, credentials);
  const { accountId } = await appDAO.getAppById(appId, ["accountId"]);

  const client = new AmplifyCloudFrontBrokerClient({
    endpoint: `https://${stage}.${region}.cfbroker.amplify.aws.dev`,
    credentials,
  });

  const res = await client.send(
    new MigrateAppToGatewayCommand({
      accountId,
      appId,
    })
  );

  logger.info(
    { appId, operationId: res.operationId },
    "Updating distributions"
  );

  if (!skipWait) {
    await waitUntilOperationCompleted(
      {
        client,
        maxWaitTime: 60 * 10,
      },
      { operationId: res.operationId }
    );

    logger.info({ appId }, "Application migrated");
  }
}

main().catch((err) => {
  logger.error(err, "Command execution failed");
  process.exit(1);
});
