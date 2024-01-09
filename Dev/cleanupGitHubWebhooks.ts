import yargs from "yargs";

import {
  Stage,
  StandardRoles,
  getIsengardCredentialsProvider,
} from "Commons/Isengard";
import logger from "Commons/utils/logger";

import { toRegionName, toAirportCode } from "Commons/utils/regions";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Octokit } from "@octokit/rest";

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Clean up webhooks for Integ Tests per stage and region

      Usage:

      npx ts-node Dev/cleanupGitHubWebhooks.ts --stage beta --region pdx
      npx ts-node Dev/cleanupGitHubWebhooks.ts --stage gamma --region pdx
      npx ts-node Dev/cleanupGitHubWebhooks.ts --stage gamma --region iad
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
      demandOption: true,
      type: "string",
    })
    .option("dryRun", {
      describe: "When true - doesn't actually delete the webhooks.",
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  const stage = args.stage as Stage;
  const region = toRegionName(args.region);
  const airportCode = toAirportCode(args.region);
  const { dryRun } = args;

  logger.info(
    `Cleaning up webhooks for Integ Test Repos for ${stage} ${region} (${airportCode})`
  );

  const credentials = getIsengardCredentialsProvider(
    "850295347350",
    StandardRoles.OncallOperator
  );

  const secretsManager = new SecretsManagerClient({
    region: "us-east-1",
    credentials,
  });

  const { SecretString } = await secretsManager.send(
    new GetSecretValueCommand({
      SecretId: "IntegrationTestRepoAccessTokens",
    })
  );

  const tokens: Record<string, string> = JSON.parse(SecretString ?? "");

  const tokenKey = `github:${region}`;
  if (!tokens[tokenKey]) {
    throw new Error(`Could not get token for ${tokenKey}.`);
  }

  const githubToken = tokens[tokenKey];
  logger.info("Got gh tokens");
  const octokit = new Octokit({
    auth: githubToken,
  });

  const owner = `aws-aemilia-${airportCode.toLowerCase()}`;

  const repos = await octokit.paginate(octokit.repos.listForUser as any, {
    username: owner,
  });

  for (const repo of repos) {
    if (!repo.name.endsWith(`${stage}-${region}`)) {
      continue;
    }

    const webhooks = await listInactiveRepoWebhooks(octokit, owner, repo.name);
    logger.info({ repo: repo.name, webhooks: webhooks.length }, "Found repo");

    for (const webhook of webhooks) {
      logger.info({ repo: repo.name, webhook: webhook.id }, "Deleting webhook");
      if (!dryRun) {
        await octokit.repos.deleteWebhook({
          owner,
          repo: repo.name,
          hook_id: webhook.id,
        });
        logger.info(
          { repo: repo.name, webhook: webhook.id },
          "Deleted webhook"
        );
      }
    }
  }
}

async function listInactiveRepoWebhooks(
  octokit: Octokit,
  owner: string,
  repo: string
) {
  const { data } = await octokit.repos.listWebhooks({
    owner,
    repo,
  });

  let webhooks: typeof data = [];
  for (const webhook of data) {
    // It's not an Amplify webhook - skip
    if (!webhook.config.url?.match(/github\?appid=/)) {
      continue;
    }
    webhooks.push(webhook);
  }

  return webhooks;
}

main().catch((err) => {
  logger.error(err, "Command execution failed");
  process.exit(1);
});
