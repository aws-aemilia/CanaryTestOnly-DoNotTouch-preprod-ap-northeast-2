import {
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Commons/Isengard";
import csv from "csvtojson";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  getDynamoDBDocumentClient,
  getLambdaEdgeConfigForAppOrDomain,
  removeDomainFromLambdaEdgeConfig,
} from "../../Commons/dynamodb";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import path from "path";

interface AppInput {
  stage: Stage;
  region: Region;
  accountId: string;
  appId: string;
  domainId: string;
  status: string;
}

interface InputArgs {
  stage: Stage;
  region: Region;
  appId?: string;
  dryRun: boolean;
  inputFile: string;
}

const removeDanglingCustomDomainIdFromLambdaEdgeConfig = async (
  ddbClient: DynamoDBDocumentClient,
  appId: string,
  domainId: string,
  dryRun: boolean
) => {
  try {
    const lambdaEdgeConfig = await getLambdaEdgeConfigForAppOrDomain(
      ddbClient,
      appId,
      ["appId", "customRuleConfigs"]
    );

    if (!lambdaEdgeConfig) {
      console.warn(`LambdaEdgeConfig not found for given appId`, appId);
      return;
    }

    if (!lambdaEdgeConfig.customDomainIds) {
      console.warn(
        `LambdaEdgeConfig does not have customDomainIds attribute`,
        appId
      );
      return;
    }

    const { customDomainIds } = lambdaEdgeConfig;

    console.log(`Found customDomainIds for given app`, {
      appId,
      customDomainIds,
    });

    if (!customDomainIds.has(domainId)) {
      console.warn(
        `LambdaEdgeConfig does not contain given domain ID in customDomainIds`,
        { appId, domainId }
      );
      return;
    }

    if (!dryRun) {
      await removeDomainFromLambdaEdgeConfig(appId, domainId, ddbClient);

      console.log(`Removed dangling customDomainId from customDomainIds`, {
        appId,
        domainId,
      });
    }
  } catch (err) {
    console.error(
      `Error removing dangling customDomainId from appId: ${appId}`,
      err
    );
  }
};

const getArgs = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
        Takes an input CSV file of this format:

        stage,region,accountId,appId,domainId,status
        prod,eu-north-1,123456789000,dxxxxxxxx,dxxxxxxxx,DOMAIN_RECORD_MISSING

        and removes the dangling domainId from the App's LambdaEdgeConfig item in DynamoDB
        `
    )
    .option("stage", {
      describe: "beta, gamma or prod",
      type: "string",
      demandOption: true,
      choices: ["beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("app-id", {
      alias: "appId",
      describe:
        "The Amplify App ID. If provided, the mitigation will only be applied against this app.",
      type: "string",
    })
    .option("dry-run", {
      alias: "dryRun",
      describe: "In dry-run mode, no writes to DynamoDB will be performed",
      type: "boolean",
      default: false,
    })
    .option("input-file", {
      alias: "inputFile",
      describe: "The name of the input file",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  return args as InputArgs;
};

const main = async () => {
  const { stage, region, appId, dryRun, inputFile } = await getArgs();
  /**
   * Input file is expected in this format:
   *
   * stage,region,accountId,appId,domainId,status
   * prod,eu-north-1,123456789000,dxxxxxxxx,dxxxxxxxx,DOMAIN_RECORD_MISSING
   *
   * Place the input file inside ./node-scripts/V737790025/
   */
  const input = path.join(inputFile);

  console.log(`Looking up input file: ${input}`);

  const apps: AppInput[] = await csv().fromFile(input);
  const appsToMitigate = [];

  if (appId) {
    console.log(`Performing mitigation for a single app:`, appId);

    const app = apps.find((app) => app.appId === appId);

    if (!app) {
      console.warn(`The given app ID was not found in the input file`);
      return;
    }

    appsToMitigate.push(app);
  } else {
    console.log(`Performing mitigation for all apps in input file`);

    appsToMitigate.push(
      ...apps.filter(
        (app) =>
          app.stage === stage &&
          app.region === region &&
          app.status === "DOMAIN_RECORD_MISSING" &&
          app.appId &&
          app.domainId
      )
    );

    if (appsToMitigate.length < 1) {
      console.warn(`No apps were found in the given region and stage`, {
        region,
        stage,
      });
      return;
    }

    console.log(`${appsToMitigate.length} apps were found to mitigate`, {
      appIds: appsToMitigate.map((app) => app.appId).toString(),
      region,
      stage,
    });
  }

  const accounts = await controlPlaneAccounts({ stage, region });

  if (!accounts || accounts.length < 1) {
    console.warn(`Account was not found for given region and stage`, {
      region,
      stage,
    });
    return;
  }

  const { accountId } = accounts[0];

  const credentials = getIsengardCredentialsProvider(
    accountId,
    "OncallOperator"
  );

  /**
   * We will use `us-east-1` as the region for all accounts since
   * `LambdaEdgeConfig` is a global table and is not available in
   * all regions
   */
  const ddbClient = getDynamoDBDocumentClient("us-east-1", credentials);

  for (const app of appsToMitigate) {
    const { appId, domainId } = app;
    await removeDanglingCustomDomainIdFromLambdaEdgeConfig(
      ddbClient,
      appId,
      domainId,
      dryRun
    );
  }
};

main().then(console.log).catch(console.error);
