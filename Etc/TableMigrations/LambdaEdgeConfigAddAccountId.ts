import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { toRegionName } from "Commons/utils/regions";
import fs from "fs";
import path from "path";
import yargs from "yargs";
import {
  AppDAO,
  DomainDAO,
  EdgeConfigDAO,
  LambdaEdgeConfig,
  lookupCustomerAccountId,
} from "../../Commons/dynamodb";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";
import logger from "Commons/utils/logger";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
# Testing on personal account
ada credentials update --account=$AWS_ACCOUNT_ID --role=admin --once
npx ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --stage=test --region=us-west-2 --operation=VERIFY --appOrDomainId=dsrtudbjtjvsp
npx ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --stage=test --region=us-west-2 --operation=VERIFY

# Testing in beta account
npx ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --stage=beta --region=us-west-2 --operation=MIGRATE --appOrDomainId=d36z6gc724kpno
npx ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --stage=beta --region=us-west-2 --operation=VERIFY
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["test", "beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("operation", {
      choices: ["MIGRATE", "VERIFY", "REVERT"],
      demandOption: true,
    })
    .option("appOrDomainId", {
      describe: "LEC AppId if you want to test migration on one item",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, operation, appOrDomainId } = args;
  const regionName = toRegionName(region);
  const stageName = stage as Stage;

  const runId = new Date().getTime().toString();

  let controlPlaneAccountId: string | undefined;

  if (stage !== "test") {
    const account = await controlPlaneAccount(stageName, regionName);
    await preflightCAZ({
      accounts: account,
      role: StandardRoles.OncallOperator,
    });
    controlPlaneAccountId = account.accountId;
  }

  const migrator = new LambdaEdgeConfigAccountIdMigrator(
    stageName,
    regionName,
    `${operation}-${runId}`,
    controlPlaneAccountId
  );

  switch (operation) {
    case "MIGRATE":
      if (appOrDomainId) {
        await migrator.migrateSingleDocument(appOrDomainId);
      } else {
        await migrator.migrateAll();
      }
      break;
    case "VERIFY":
      await migrator.verifyAll();
      break;
    case "REVERT":
      await migrator.revertAll();
      break;
    default:
      throw new Error(`Unknown operation ${operation}`);
  }
};

const attributesToGet: (keyof LambdaEdgeConfig)[] = ["appId", "accountId"];
type FetchedLec = Pick<LambdaEdgeConfig, "appId" | "accountId">;

class LambdaEdgeConfigAccountIdMigrator {
  private outputFile: string;
  /**
   * Undefined for personal account
   */
  private controlplaneCredentials: Provider<AwsCredentialIdentity> | undefined;
  private ddbClient: DynamoDBDocumentClient;
  private appDAO: AppDAO;
  private domainDAO: DomainDAO;
  private lecDAO: EdgeConfigDAO;

  constructor(
    private stage: Stage,
    private region: Region,
    private runId: string,
    private accountId?: string
  ) {
    this.outputFile = path.join(
      __dirname,
      "..",
      "..",
      "tmp",
      `LambdaEdgeConfigAddAccountId-${this.runId}.csv`
    );

    logger.info(`Writing output to ${this.outputFile}`);

    if (stage !== "test") {
      if (!this.accountId) {
        throw new Error("accountId is required for non-test stage");
      }

      this.controlplaneCredentials = getIsengardCredentialsProvider(
        this.accountId,
        StandardRoles.OncallOperator
      );
    }

    this.ddbClient = getDdbClient(this.region, this.controlplaneCredentials);
    this.appDAO = new AppDAO(
      this.stage,
      this.region,
      this.controlplaneCredentials
    );
    this.domainDAO = new DomainDAO(
      this.stage,
      this.region,
      this.controlplaneCredentials
    );

    this.lecDAO = new EdgeConfigDAO(
      this.stage as Stage,
      this.region as Region,
      this.controlplaneCredentials
    );
  }

  public async migrateAll() {
    let count = 0;
    for await (let page of await this.lecDAO.paginate(attributesToGet, 100)) {
      const lecDOs = page.Items as FetchedLec[];
      if (!lecDOs) {
        console.info("No more items found in the page");
        break;
      }

      count += lecDOs.length;
      for (let lecDO of lecDOs) {
        await this.migrate(lecDO);
      }
      logger.info(`Processed ${count} items`);
    }
  }

  public async verifyAll() {
    let count = 0;
    for await (let page of await this.appDAO.paginate(
      ["appId", "accountId"],
      1000
    )) {
      const appDOs = page.Items as
        | { appId: string; accountId: string }[]
        | undefined;
      if (!appDOs) {
        console.info("No more items found in the page");
        break;
      }

      for (let appDO of appDOs) {
        // Verify the amplifyapp.com LEC
        this.verifyLec(appDO.appId, appDO.accountId);

        // Verify the custom domain LECs
        for await (let page of await this.domainDAO.paginateDomainsForApp(
          appDO.appId,
          ["appId", "domainId"]
        )) {
          const domainDOs = page.Items as
            | { appId: string; domainId: string }[]
            | undefined;
          if (!domainDOs) {
            console.info("No more items found in the page");
            break;
          }

          for (let domainDO of domainDOs) {
            await this.verifyLec(domainDO.appId, appDO.accountId);
          }
        }
      }
      count += appDOs.length;
      logger.info(`Processed ${count} items`);
    }
  }

  private async verifyLec(appOrDomainId: string, exprectedAccountId: string) {
    const lecDO = await this.lecDAO.getLambdaEdgeConfigForAppOrDomain(
      appOrDomainId,
      attributesToGet
    );

    if (!lecDO) {
      this.logToFile("VERIFY", appOrDomainId, "EDGE_CONFIG_NOT_FOUND");
      return;
    }

    this.logToFile(
      "VERIFY",
      appOrDomainId,
      exprectedAccountId === lecDO.accountId
        ? "✅ACCOUNT_ID_MATCHED"
        : "❌ACCOUNT_ID_MISMATCH"
    );
  }

  public async revertAll() {
    let count = 0;
    for await (let page of await this.lecDAO.paginate(attributesToGet, 100)) {
      const lecDOs = page.Items as FetchedLec[];
      if (!lecDOs) {
        console.info("No more items found in the page");
        break;
      }
      count += lecDOs.length;

      for (let lecDO of lecDOs) {
        await this.lecDAO.removeAccountId(lecDO.appId);
        this.logToFile("REVERT", lecDO.appId, "ACCOUNT_ID_REMOVED");
      }
      logger.info(`Processed ${count} items`);
    }
  }

  /**
   * Primarily used for testing migration before running for all documents
   */
  public async migrateSingleDocument(appOrDomainId: string) {
    const lecDO = (await this.lecDAO.getLambdaEdgeConfigForAppOrDomain(
      appOrDomainId,
      attributesToGet
    )) as FetchedLec | undefined;

    if (!lecDO) {
      this.logToFile("MIGRATE", appOrDomainId, "LambdaEdgeConfig_NOT_FOUND");
      throw new Error(`No LambdaEdgeConfig found for ${appOrDomainId}`);
    }

    await this.migrate(lecDO);
  }

  private migrate = async (lecDO: FetchedLec) => {
    const appOrDomainId = lecDO.appId;

    if (lecDO.accountId) {
      this.logToFile("MIGRATE", appOrDomainId, lecDO.accountId);
      return;
    }

    const acctId = await lookupCustomerAccountId(
      this.ddbClient,
      this.stage,
      this.region,
      appOrDomainId
    );

    if (!acctId) {
      this.logToFile("MIGRATE", appOrDomainId, "ACCOUNT_ID_NOT_FOUND");
      return;
    }

    this.lecDAO.setAccountId(appOrDomainId, acctId);

    this.logToFile("MIGRATE", appOrDomainId, acctId);
  };

  private logToFile(
    operation: "MIGRATE" | "VERIFY" | "REVERT",
    appOrDomainId: string,
    acctId: string
  ) {
    fs.appendFileSync(
      this.outputFile,
      `${operation},${this.stage},${this.region},${this.accountId},${appOrDomainId},${acctId}\n`
    );
  }
}

function getDdbClient(
  region: Region,
  credentials?: Provider<AwsCredentialIdentity>
) {
  const dynamodbClient = new DynamoDBClient({ region, credentials });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

main().catch((err) => {
  console.error(err), process.exit(1);
});
