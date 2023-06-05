import {
  IAMClient,
  paginateListRoles,
  Role,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
  integTestAccounts,
  Region,
  Stage,
} from "../../commons/Isengard";
import yargs from "yargs";

require("util").inspect.defaultOptions.depth = null;

const getBatsRoles = async (iamClient: IAMClient): Promise<Role[]> => {
  const roles: Role[] = [];
  for await (const listRolesCommandOutput of paginateListRoles(
    { client: iamClient },
    {}
  )) {
    listRolesCommandOutput
      .Roles!.filter((r) => r.RoleName!.startsWith("HydraBATSRole"))
      .forEach((r) => roles.push(r));
  }

  return roles;
};

const mutatePolicy = (policy: any, pipelineId: string): any => {
  const policyCopy = JSON.parse(JSON.stringify(policy));

  const condition = policyCopy.Statement[0].Condition.StringEquals;
  const currentValue: any = condition["bats.amazon.com:entity"];

  if (Array.isArray(currentValue) && !currentValue.includes(pipelineId)) {
    currentValue.push(pipelineId);
  }

  if (typeof currentValue === "string") {
    condition["bats.amazon.com:entity"] = [currentValue, pipelineId];
  }

  return policyCopy;
};

const patchRoles = async (acc: AmplifyAccount, pipelineId: string) => {
  console.log(`Patching roles for account: ${acc.accountId} ${acc.email}`);
  const iamClient = new IAMClient({
    region: acc.region,
    credentials: getIsengardCredentialsProvider(acc.accountId, "Admin"),
  });

  const roles = await getBatsRoles(iamClient);

  for (const role of roles) {
    console.log("Role:", role);
    const policy: any = JSON.parse(
      decodeURIComponent(role.AssumeRolePolicyDocument!)
    );
    console.log("Current policy:", policy);

    const mutatedPolicy = mutatePolicy(policy, pipelineId);
    console.log("Updating policy to:", mutatedPolicy);

    await iamClient.send(
      new UpdateAssumeRolePolicyCommand({
        RoleName: role.RoleName,
        PolicyDocument: JSON.stringify(mutatedPolicy),
      })
    );
  }
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
          Adds a pipelineId to the list of "bats.amazon.com:entity" in the assume role policy of HydraBATSRole.
          This is needed to share a hydra stack between different pipelines when using CDK. See: https://sim.amazon.com/issues/T2-10912
          (LPT does allow you to override the pipeline list in the role)
          
          You only need to run this tool once after bootstrapping an integ test account. 
          `
    )
    .option("pipelineId", {
      describe: "The pipeline Id to be added to the assume role policy",
      type: "string",
      demandOption: true,
    })
    .option("stage", {
      describe:
        "stage to run the command. If not specified runs in all stages (it's ok, they are integ test accounts)",
      type: "string",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe:
        "region to run the command. e.g. us-west-2. If not specified runs in all regions (it's ok, they are integ test accounts)",
      type: "string",
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, pipelineId } = args;

  const accounts = await integTestAccounts({
    stage: stage as Stage,
    region: region as Region,
  });

  for (const account of accounts) {
    await patchRoles(account, pipelineId);
  }
};

main().then(console.log).catch(console.error);
