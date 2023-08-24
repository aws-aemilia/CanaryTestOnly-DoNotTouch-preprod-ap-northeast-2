import yargs from "yargs";
import { Octokit } from "@octokit/rest";

type Webhook = {
  id: number;
  config: {
    url: string;
  };
};

const getGitAccountOwner = async (gitClient: Octokit): Promise<string> => {
  const result = await gitClient.rest.users.getAuthenticated();
  return result.data.login;
};

const listWebhooks = async (
  gitClient: Octokit,
  owner: string,
  repo: string
): Promise<Webhook[]> => {
  const webhooks = await gitClient.request("GET /repos/{owner}/{repo}/hooks", {
    owner: owner,
    repo: repo,
  });
  const hooks: Webhook[] = [];
  webhooks.data.forEach((webhook) => {
    if (webhook.config.url) {
      hooks.push({
        id: webhook.id,
        config: {
          url: webhook.config.url,
        },
      });
    }
  });
  return hooks;
};

const deleteWebhook = async (
  gitClient: Octokit,
  owner: string,
  repo: string,
  webhook: Webhook
) => {
  console.log(`deleteing webhook: ${webhook.config.url}`);
  await gitClient.request("DELETE /repos/{owner}/{repo}/hooks/{hook_id}", {
    owner: owner,
    repo: repo,
    hook_id: webhook.id,
  });
};

const filterOutNonAmplifyWebhooks = (webhooks: Webhook[]) => {
  return webhooks.filter((webhook) => {
    if (webhook.config.url.match(/github\?appid=/)) {
      return true;
    }
  });
};

const filterAmplifyWebhooksByRegion = (webhooks: Webhook[], region: string) => {
  return webhooks.filter((webhook) => {
    if (webhook.config.url.match(region)) {
      return true;
    }
  });
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
This tool allows you to cleanup your GitHub Webhooks for a repo. Useful for when you hit the 20 webhook limit.
**Pre-Req** You need to create a GitHub personal access token with Read/Delete permission on Webhooks.

# deletes all Amplify webhooks for repo "my_repo_name"
npx ts-node cleanupGitHubWebhooks.ts --githubToken ghp_****** --repo my_repo_name

# deletes all Amplify webhooks created from region "us-west-2" for repo "my_repo_name"
npx ts-node cleanupGitHubWebhooks.ts --githubToken ghp_****** --repo my_repo_name --region us-west-2
      `
    )
    .option("githubToken", {
      describe:
        "token for your github account. must have at least delete repo permissions",
      type: "string",
      demandOption: true,
    })
    .option("repo", {
      describe: "repo to delete webhooks for",
      type: "string",
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;
  const { githubToken, region, repo } = args;
  console.log(`args: ${JSON.stringify(args)}`);

  if (!githubToken) {
    throw new Error("no github token was provided.");
  }

  const octokit = new Octokit({ auth: githubToken });
  const owner = await getGitAccountOwner(octokit);
  const webhooks = await listWebhooks(octokit, owner, repo);
  const amplifyWebhooks = filterOutNonAmplifyWebhooks(webhooks);
  if (amplifyWebhooks.length === 0) {
    console.log(`there are no amplify webhooks for repo ${repo}`);
    return;
  }

  if (!region) {
    // delete all amplify webhooks on repo
    for (const webhook of amplifyWebhooks) {
      await deleteWebhook(octokit, owner, repo, webhook);
    }
  } else if (region) {
    // delete all amplify webhooks for region on repo
    const amplifyRegionWebhooks = filterAmplifyWebhooksByRegion(
      amplifyWebhooks,
      region
    );
    if (amplifyRegionWebhooks.length === 0) {
      console.log(
        `there are no amplify webhooks for repo ${repo} and region: ${region}`
      );
      return;
    }
    for (const webhook of amplifyRegionWebhooks) {
      await deleteWebhook(octokit, owner, repo, webhook);
    }
  }
};

main()
  .then()
  .catch((e) => {
    console.error("\nSomething went wrong");
    console.error(e);
  });
