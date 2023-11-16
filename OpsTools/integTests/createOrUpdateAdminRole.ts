import {
  AttachRolePolicyCommand,
  CreateRoleCommand,
  GetRoleCommand,
  IAMClient,
  Role,
  UpdateAssumeRolePolicyCommand,
} from "@aws-sdk/client-iam";
import yargs from "yargs";
import {
  aesIntegTestAccounts,
  getIsengardCredentialsProvider,
  Stage,
} from "../../Commons/Isengard";
import logger from "../../Commons/utils/logger";

// This role is used by the Integration Tests to create resources in the test accounts.
// These are low risk accounts so it's ok to have them use an Admin role.
const roleName = "AdminRoleForIntegrationTests";
const policyArn = "arn:aws:iam::aws:policy/AdministratorAccess";
const trustPolicy = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: "sts:AssumeRole",
      Principal: {
        Service: [
          "test.amplify.aws.internal", // personal dev accounts
          "gamma.amplify.amazonaws.com", // control plane beta/gamma/preprod accounts
          "gamma.cloudwatch.amplify.aws.internal", // kinesis consumer gamma accounts
          "amplify.amazonaws.com", // control plane prod accounts
          "cloudwatch.amplify.aws.internal", // kinesis consumer prod accounts
          "test.cloudwatch.amplify.aws.internal", // kinesis consumer beta account
        ],
      },
    },
  ],
};

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Creates or updates the role 'AdminRoleForIntegrationTests' used by 
      Integration Tests to create resources in the test accounts.

      Example usage:
        brazil-build adminRoleForIntegrationTests -- --stage=gamma
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage } = args;
  const accounts = await aesIntegTestAccounts({ stage: stage as Stage });

  for (const account of accounts) {
    logger.info("=========================================");
    logger.info(
      "Checking integration test account %s (%s %s)",
      account.accountId,
      account.stage,
      account.airportCode
    );
    const creds = getIsengardCredentialsProvider(account.accountId, "Admin");
    const iamClient = new IAMClient({
      region: "us-east-1",
      credentials: creds,
    });

    try {
      const role = await iamClient.send(
        new GetRoleCommand({
          RoleName: roleName,
        })
      );
      if (role.Role) {
        logger.info("Role already exists, updating it");
        await updateRole(iamClient, role.Role);
      } else {
        logger.info("Role does not exist");
        await createRole(iamClient);
      }
    } catch (e) {
      logger.info("Role does not exist");
      await createRole(iamClient);
    }
  }
}

async function createRole(iamClient: IAMClient) {
  logger.info("Creating role %s", roleName);
  await iamClient.send(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
    })
  );

  logger.info("Attaching policy %s", policyArn);
  await iamClient.send(
    new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: policyArn,
    })
  );
}

async function updateRole(iamClient: IAMClient, role: Role) {
  logger.info(trustPolicy, "Updating trust policy");
  await iamClient.send(
    new UpdateAssumeRolePolicyCommand({
      RoleName: roleName,
      PolicyDocument: JSON.stringify(trustPolicy),
    })
  );

  logger.info("Attaching policy %s", policyArn);
  await iamClient.send(
    new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: policyArn,
    })
  );
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
