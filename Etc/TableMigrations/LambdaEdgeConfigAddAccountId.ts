import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { RegionName } from "Commons/Isengard/types";
import logger from "Commons/utils/logger";
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
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";

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

# Wave 3 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --stage=prod --region="eu-west-1" --region="us-east-1" --region="ap-southeast-1" --operation=MIGRATE

# Wave 4 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --operation=MIGRATE --stage=prod --region="ap-south-1" --region="eu-central-1" --region="ap-northeast-2" --region="ap-northeast-1" --region="us-west-2" --region="ap-southeast-2"

# Wave 5 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigAddAccountId.ts --operation=MIGRATE --stage=prod --region="eu-north-1" --region="me-south-1" --region="eu-west-3" --region="sa-east-1" --region="ap-east-1" --region="eu-west-2" --region="eu-south-1" --region="us-west-1"

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
      array: true,
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
  const stageName = stage as Stage;

  const runId = new Date().getTime().toString();

  const accounts = await getAccounts(stageName, region);

  const migrators = accounts.map(
    (a) =>
      new LambdaEdgeConfigAccountIdMigrator(
        stageName,
        a.region as Region,
        `${operation}-${runId}`,
        a.accountId
      )
  );

  let operations: Promise<void>[] = [];

  migrators.forEach((migrator) => {
    switch (operation) {
      case "MIGRATE":
        if (appOrDomainId) {
          operations.push(migrator.migrateSingleDocument(appOrDomainId));
        } else {
          operations.push(migrator.migrateAll());
        }
        break;
      case "VERIFY":
        operations.push(migrator.verifyAll());
        break;
      case "REVERT":
        operations.push(migrator.revertAll());
        break;
      default:
        throw new Error(`Unknown operation ${operation}`);
    }
  });

  await Promise.all(operations);
};

async function getAccounts(stage: Stage, regions: string[]) {
  const regionNames = regions.map((r) => toRegionName(r));

  const accounts = (await controlPlaneAccounts({ stage })).filter((a) =>
    regionNames.includes(a.region as RegionName)
  );
  await preflightCAZ({
    accounts,
    role: StandardRoles.OncallOperator,
  });
  return accounts;
}

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
    for await (let page of await this.lecDAO.paginate(attributesToGet, 1000)) {
      const lecDOs = page.Items as FetchedLec[];
      if (!lecDOs) {
        console.info("No more items found in the page");
        break;
      }

      count += lecDOs.length;
      for (let lecDO of lecDOs) {
        await this.migrate(lecDO);
      }
      logger.info(`${this.stage}-${this.region} Processed ${count} items`);
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
      logger.info(`${this.stage}-${this.region} ${count} items processed`);
    }
    logger.info(
      `${this.stage}-${this.region} Completed. ${count} items verified`
    );
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

    if (appOrDomainId.includes("_")) {
      this.logToFile("MIGRATE", appOrDomainId, "INVALID_APPID");
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
