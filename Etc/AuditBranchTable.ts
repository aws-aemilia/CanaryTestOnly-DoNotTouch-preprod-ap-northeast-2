import { Credentials, Provider } from "@aws-sdk/types";
import fs from "fs";
import { LRUCache } from "lru-cache";
import yargs from "yargs";
import {
  Region,
  Stage,
  controlPlaneAccount,
  getIsengardCredentialsProvider,
} from "../Commons/Isengard";
import { AppDO, BranchDO } from "../Commons/dynamodb";
import { AppDAO } from "../Commons/dynamodb/tables/AppDAO";
import { BranchDAO } from "../Commons/dynamodb/tables/BranchDAO";
import { AsyncResourceDeletionQueue } from "../Commons/sqs/AsyncResourceDeletionQueue";

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      ts-node AuditBranchTable --stage test --region us-west-2 --alias $(whoami) --dryRun
      ts-node AuditBranchTable --stage beta --region us-west-2 --dryRun
      ts-node AuditBranchTable --stage prod --region us-west-2 --ticket D0000000 --dryRun
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
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
    })
    .option("alias", {
      describe: "alias used for test stage",
      type: "string",
    })
    .option("dryRun", {
      describe: "run the commmand as readOnly",
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, stage, ticket, alias, dryRun } = args;

  process.env.ISENGARD_SIM = ticket;

  let controlplaneCredentials: Provider<Credentials> | undefined;

  // Test accounts should use ada credentials update --account --role
  if (stage !== "test") {
    const cpAccount = await controlPlaneAccount(
      stage as Stage,
      region as Region
    );
    controlplaneCredentials = getIsengardCredentialsProvider(
      cpAccount.accountId,
      dryRun ? "FullReadOnly" : "OncallOperator"
    );
  }

  const appDAO = new AppDAO(stage, region, controlplaneCredentials);
  const branchDAO = new BranchDAO(stage, region, controlplaneCredentials);
  const asyncResourceDeletionQueue = new AsyncResourceDeletionQueue(
    region,
    stage,
    controlplaneCredentials,
    alias
  );
  await asyncResourceDeletionQueue.init();
  const filename = `${Date.now()}-${stage}-${region}-branch-audit-result.txt`;

  const appDOCache = new LRUCache<string, AppDO>({
    max: 1000,
    fetchMethod: async (key) => {
      return appDAO.getAppById(key) as Promise<AppDO>;
    },
  });

  for await (let page of branchDAO.paginate()) {
    const branchDOs = page.Items as BranchDO[];
    if (!branchDOs) {
      console.info("No more items found in the page");
      break;
    }

    for (let branchDO of branchDOs) {
      if (!branchDO.deleting) {
        continue;
      }
      const branchDOJava = branchDAO.mapToJavaType(branchDO);

      let appDO: AppDO | undefined = await appDOCache.fetch(
        branchDOJava.appId!
      );

      if (!appDO) {
        fs.appendFileSync(
          filename,
          `BranchDO exists without AppDO: ${branchDOJava.branchArn}\n`
        );
        continue;
      }
      const appDOJava = appDAO.mapToJavaType(appDO);

      fs.appendFileSync(
        filename,
        `Sending DeleteBranch to AsyncResourceDeletionQueue: ${
          stage !== "prod" ? JSON.stringify(appDOJava) : branchDOJava.branchArn
        } | ${stage !== "prod" ? JSON.stringify(appDOJava) : appDOJava.appId}\n`
      );

      if (dryRun) {
        continue;
      }

      await asyncResourceDeletionQueue.sendDeleteBranchMessage(
        appDOJava,
        branchDOJava
      );
    }
  }
};

main().then().catch(console.error);
