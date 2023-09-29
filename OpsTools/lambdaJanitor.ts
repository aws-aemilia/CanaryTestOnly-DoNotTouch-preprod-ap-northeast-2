import logger from "../Commons/utils/logger";
import { SpinningLogger } from "../Commons/utils/spinningLogger";
import { getIsengardCredentialsProvider } from "../Commons/Isengard";
import { toRegionName } from "../Commons/utils/regions";
import rateLimit from "p-limit";
import confirm from "../Commons/utils/confirm";
import yargs from "yargs";
import {
  LambdaClient,
  paginateListFunctions,
  paginateListVersionsByFunction,
  paginateListAliases,
  FunctionConfiguration,
  AliasConfiguration,
  DeleteFunctionCommand,
} from "@aws-sdk/client-lambda";

const spinner = new SpinningLogger();
const deleteFunctionRateLimit = rateLimit(3);
let deletedMB = 0;

async function main() {
  logger.info(
    `
        ||
        ||
        ||    Welcome to Lambda Janitor! Let's sweep, let's clear, with not a single
        ||    smear. Unused functions will disappear, making Lambda space cheer!  
        ||
        ||             
        ||            
       /||\\           ____.-.____
      /||||\\         [___________]
      ======          | | | | | | 
      ||||||          | | | | | |
      ||||||          | | | | | |
      ||||||          |_________|
      `
  );

  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Deletes unused versions of Lambda functions. Can only be run in low risk 
      accounts like integration tests because it needs lambda:DeleteFunction
      permission which the standard safe roles don't have. 
      
      Usage:
        brazil-build lambdaJanitor -- --region=iad --accountId=1111111111
      `
    )
    .option("region", {
      describe: "The region or airport code (i.e. iad, or us-east-1)",
      type: "string",
      demandOption: true,
    })
    .option("roleName", {
      describe: "IAM role to assume to delete functions",
      type: "string",
      default: "Admin",
      demandOption: true,
    })
    .option("accountId", {
      describe: "AWS account to delete functions from",
      type: "string",
      demandOption: true,
    })
    .option("numVersionsToKeep", {
      describe: "How many recent versions not to delete",
      type: "number",
      demandOption: false,
      default: 5,
      validate: (value: number) => {
        if (value < 2) {
          throw new Error("numVersionsToKeep must not be less than 2");
        }
        return true;
      },
    })
    .option("skipConfirmation", {
      alias: "yes",
      describe: "Whether to skip deletion confirmation prompts",
      type: "boolean",
      demandOption: false,
      default: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, numVersionsToKeep, roleName, accountId, skipConfirmation } =
    args;
  const regionName = toRegionName(region);

  const lambdaClient = new LambdaClient({
    region: regionName,
    credentials: getIsengardCredentialsProvider(accountId, roleName),
  });

  logger.info("Listing Lambda functions");
  const functionPaginator = paginateListFunctions(
    {
      client: lambdaClient,
    },
    {
      MaxItems: 100,
    }
  );

  for await (const page of functionPaginator) {
    for (const func of page.Functions || []) {
      const versions = await listVersions(lambdaClient, func.FunctionName!);

      if (versions.length === 0) {
        logger.info("No versions found for %s. Skipping", func.FunctionName);
        continue;
      }

      if (versions.length - numVersionsToKeep <= 0) {
        logger.info(
          "Function has %s versions, not enough to delete. Skipping",
          versions.length
        );
        continue;
      }

      const sortedVersions = orderVersionsDescending(versions);
      logger.info("Found %s versions", versions.length);

      const aliases = await listAliases(lambdaClient, func.FunctionName!);
      logger.info("Found %s aliases", aliases.length);

      let versionsToDelete = sortedVersions.slice(numVersionsToKeep + 1);
      let versionsToKeep = sortedVersions.slice(0, numVersionsToKeep + 1);

      if (aliases.length > 0) {
        logger.info("Excluding versions that are aliased");
        versionsToDelete = versionsToDelete.filter((version) => {
          if (aliases.every((a) => a.FunctionVersion !== version.Version)) {
            // No alias points to this version
            return true;
          } else {
            // At least one alias points to this version
            logger.info(
              "Excluding %s because it is referenced by an alias",
              version.Version
            );
            versionsToKeep.push(version);
            return false;
          }
        });
      }

      logger.info("=====================================");

      logger.info(
        "Will delete versions [%s]",
        versionsToDelete.map((v) => v.Version)
      );

      logger.info(
        "Will keep versions [%s]",
        versionsToKeep.map((v) => v.Version)
      );

      logger.info("=====================================");

      if (
        skipConfirmation ||
        (await confirm("Are you sure you want to delete these versions?"))
      ) {
        // Delete them in parallel with rate limit
        const deletions = versionsToDelete.map((version) =>
          deleteFunctionRateLimit(() => deleteVersion(lambdaClient, version))
        );

        await Promise.all(deletions);
        logger.info("Finished deleting versions for %s", func.FunctionName);
      }
    }
  }

  logger.info("Deleted %s MB", Math.floor(deletedMB));
}

function orderVersionsDescending(
  versions: FunctionConfiguration[]
): FunctionConfiguration[] {
  return versions.sort((a, b) => {
    const aVersion = parseInt(a.Version!);
    const bVersion = parseInt(b.Version!);
    return bVersion - aVersion;
  });
}

async function deleteVersion(
  lambdaClient: LambdaClient,
  version: FunctionConfiguration
) {
  if (!version.FunctionName || !version.Version) {
    throw new Error("FunctionName or Version is undefined");
  }

  try {
    await lambdaClient.send(
      new DeleteFunctionCommand({
        FunctionName: version.FunctionName,
        Qualifier: version.Version,
      })
    );
    deletedMB += version.CodeSize! / 1024 / 1024;
    logger.info("Deleted %s", version.FunctionArn);
  } catch (err) {
    logger.error("Failed to delete %s, %s", version.FunctionArn, err);
  }
}

async function listVersions(
  lambdaClient: LambdaClient,
  functionName: string
): Promise<FunctionConfiguration[]> {
  logger.info("Listing versions for %s", functionName);
  spinner.spinnerStart();
  const versionsPaginator = paginateListVersionsByFunction(
    {
      client: lambdaClient,
    },
    {
      FunctionName: functionName,
    }
  );

  const allVersions: FunctionConfiguration[] = [];
  for await (const versionsPage of versionsPaginator) {
    for (const version of versionsPage.Versions || []) {
      spinner.update(version.Version!);
      allVersions.push(version);
    }
  }

  spinner.spinnerStop("Finished listing versions", true);
  return allVersions;
}

async function listAliases(
  lambdaClient: LambdaClient,
  functionName: string
): Promise<AliasConfiguration[]> {
  logger.info("Listing aliases for %s", functionName);
  spinner.spinnerStart();
  const aliasPaginator = paginateListAliases(
    {
      client: lambdaClient,
    },
    {
      FunctionName: functionName,
    }
  );

  const aliases: AliasConfiguration[] = [];
  for await (const aliasesPage of aliasPaginator) {
    for (const alias of aliasesPage.Aliases || []) {
      spinner.update(alias.Name!);
      aliases.push(alias);
    }
  }

  spinner.spinnerStop("Finished listing aliases", true);
  return aliases;
}

main()
  .then(() => logger.info("Done"))
  .catch((e) => logger.error(e));
