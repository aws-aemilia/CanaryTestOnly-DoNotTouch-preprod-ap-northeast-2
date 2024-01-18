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
} from "../../Commons/dynamodb";
import {
  AmplifyAccount,
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
npx ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --stage=test --region=us-west-2 --operation=VERIFY --appOrDomainId=dsrtudbjtjvsp
npx ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --stage=test --region=us-west-2 --operation=VERIFY

# Testing in beta account
npx ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --stage=beta --region=us-west-2 --operation=VERIFY --appOrDomainId=d36z6gc724kpno
npx ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --stage=beta --region=us-west-2 --operation=VERIFY

# Wave 3 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --stage=prod --region="eu-west-1" --region="us-east-1" --region="ap-southeast-1" --operation=VERIFY

# Wave 4 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --operation=VERIFY --stage=prod --region="ap-south-1" --region="eu-central-1" --region="ap-northeast-2" --region="ap-northeast-1" --region="us-west-2" --region="ap-southeast-2"

# Wave 5 Prod
ts-node Etc/TableMigrations/LambdaEdgeConfigMissingBranchName.ts --operation=VERIFY --stage=prod --region="eu-north-1" --region="me-south-1" --region="eu-west-3" --region="sa-east-1" --region="ap-east-1" --region="eu-west-2" --region="eu-south-1" --region="us-west-1"

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
      demandOption: false,
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
      new LambdaEdgeConfigMigrator(
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

async function getAccounts(stage: Stage, regions?: string[]) {
  let accounts: AmplifyAccount[] = [];

  if (!regions) {
    accounts = await controlPlaneAccounts({ stage });
  } else {
    const regionNames = regions.map((r) => toRegionName(r));

    accounts = (await controlPlaneAccounts({ stage })).filter((a) =>
      regionNames.includes(a.region as RegionName)
    );
  }

  await preflightCAZ({
    accounts,
    role: StandardRoles.OncallOperator,
  });
  return accounts;
}

const attributesToGet: (keyof LambdaEdgeConfig)[] = ["appId", "branchConfig"];
type FetchedLec = Pick<LambdaEdgeConfig, "appId" | "branchConfig">;

class LambdaEdgeConfigMigrator {
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
      `LambdaEdgeConfigMissingBranchName-${this.runId}.csv`
    );

    logger.info(`Writing output to ${this.outputFile}`);

    if (stage !== "test") {
      if (!this.accountId) {
        throw new Error("accountId is required for non-test stage");
      }

      this.controlplaneCredentials = getIsengardCredentialsProvider(
        this.accountId,
        StandardRoles.FullReadOnly
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
    throw new Error("Not implemented");
  }

  public async verifyAll() {
    for await (let page of await this.lecDAO.paginate(attributesToGet, 100)) {
      const lecDOs = page.Items as FetchedLec[];
      if (!lecDOs) {
        console.info("No more items found in the page");
        break;
      }
      for (let lecDO of lecDOs) {
        this.verifyLec(lecDO);
      }
    }
  }

  private verifyLec(lecDO: FetchedLec) {
    const branchConfig = lecDO.branchConfig || {};
    Object.values(branchConfig).forEach((bc) => {
      if (!bc.branchName) {
        this.logToFile("VERIFY", lecDO.appId, "BRANCH_NAME_NOT_FOUND");
        return;
      }
    });
  }

  public async revertAll() {
    throw new Error("Not implemented");
  }

  /**
   * Primarily used for testing migration before running for all documents
   */
  public async migrateSingleDocument(appOrDomainId: string) {
    throw new Error("Not implemented");
  }

  private migrate = async (lecDO: FetchedLec) => {
    throw new Error("Not implemented");
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
