import logger from "../../Commons/utils/logger";
import yargs from "yargs";
import { buildControlPlaneEndpoint } from "../../Commons/utils/controlPlaneEndpoint";
import {
  getIsengardCredentialsProvider,
  integTestAccounts,
  Stage,
  Region,
} from "../../Commons/Isengard";
import {
  ListAppsCommand,
  DeleteAppCommand,
  AmplifyClient,
  App,
  ListAppsCommandOutput,
} from "@aws-sdk/client-amplify";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Deletes Amplify apps used by integration tests. This is a safe tool because it operates on the
      integration test accounts using the public Amplify Hosting API. It does not operate on any prod
      account neither accesses DynamoDB or any production resource. 

      Example usage:
        brazil-build deleteIntegTestApps -- --stage=gamma --withNameContaining=HostingGatewayTests --withNameContaining=EdgeV1 --dryRun
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "Optional region to run the command into, i.e. pdx, us-east-1",
      type: "string",
      demandOption: false,
    })
    .option("withNameContaining", {
      type: "array",
      demandOption: true,
      describe: "A string to filter apps which their name contains such string",
    })
    .option("dryRun", {
      describe:
        "If provided, the command will not delete any app, but will print the apps to be deleted",
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, withNameContaining, dryRun } = args;
  const integrationTestAccounts = await integTestAccounts({
    stage: stage as Stage,
    region: region as Region,
  });

  for (const integTestAccount of integrationTestAccounts) {
    logger.info("=========================================");
    logger.info(integTestAccount, "Starting execution");
    const endpoint = buildControlPlaneEndpoint(
      stage as Stage,
      integTestAccount.region as Region
    );
    logger.info(`Control plane endpoint ${endpoint}`);
    logger.info("=========================================");

    const amplifyClient = new AmplifyClient({
      endpoint,
      region: integTestAccount.region,
      credentials: getIsengardCredentialsProvider(
        integTestAccount.accountId,
        "Admin"
      ),
    });

    let nextToken = undefined;
    const toDelete: App[] = [];
    logger.info(withNameContaining, "Looking for apps with name");

    do {
      let result: ListAppsCommandOutput = await amplifyClient.send(
        new ListAppsCommand({
          maxResults: 100,
          nextToken,
        })
      );

      logger.info(`Paginating. Found ${result.apps?.length} apps on this page`);
      result.apps?.forEach((app: App) => {
        if (
          withNameContaining.every((str) => {
            logger.debug(
              `Evaluating app ${app.name} against ${str.toString()}`
            );
            return app.name?.includes(str.toString());
          })
        ) {
          toDelete.push(app);
        }
      });

      nextToken = result.nextToken;
    } while (nextToken);

    logger.info(
      `Apps to delete ${JSON.stringify(
        toDelete.map((app) => `${app.name} (${app.appId})`),
        null,
        2
      )}`
    );

    if (dryRun) {
      logger.warn("Dry run enabled, skippipng deletion");
    } else {
      for await (const appToDelete of toDelete) {
        await amplifyClient.send(
          new DeleteAppCommand({
            appId: appToDelete.appId,
          })
        );
        logger.info(`Deleted app ${appToDelete.name}`);
      }
    }
  }
}

main();
