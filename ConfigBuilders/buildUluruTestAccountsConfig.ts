import logger from "../Commons/utils/logger";
import fs from "fs";
import yaml from "js-yaml";
import {
  getIsengardCredentialsProvider,
  uluruAccounts,
} from "../Commons/Isengard";
import {
  CloudFormationClient,
  DescribeStackResourcesCommand,
} from "@aws-sdk/client-cloudformation";

/**
 * WHAT IS THIS?
 *
 * This script is used to generate the testAccountsConfig.yml file:
 * https://tiny.amazon.com/166174hyr/testAccountsConfigyml
 *
 * The testAccountsConfig.yml file contains a list of resources that Uluru team needs to run the
 * Contract Tests V2 in our own accounts as opposed to running them in Uluru service accounts.
 * This file is optional, if not provided, Contract Tests will run in Uluru service accounts. However,
 * its best to run them in our own accounts so that we can troubleshoot failures easier.
 *
 * This script will pull resources from CloudFormation that are created by this stack:
 * https://tiny.amazon.com/idpnhxk3/ContractTeststemplateyml
 *
 * and deployed via this pipeline:
 * https://pipelines.amazon.com/pipelines/AWSCloudFormationResourceProvidersAmplify
 *
 * Contract Tests v2 are only enforced in production accounts, so this script will only pull resources
 * from production accounts, although the resources also exist in beta and gamma accounts, they are just
 * not used nor included in the testAccountsConfig.yml file.
 *
 * INSTRUCTIONS
 *
 * 1. Run this script `brazil-build uluru-generate-test-accounts-config`
 * 2. Copy the contents of the generated YAML file and paste them here:
 * https://tiny.amazon.com/166174hyr/testAccountsConfigyml
 */

interface ContractTestResources {
  regionName: string;
  iamRoleArn: string;
  s3BucketName: string;
  kmsKeyArn: string;
}

async function main() {
  const accounts = await uluruAccounts({
    stage: "prod",
  });

  const contractTestResources: ContractTestResources[] = [];

  for (const account of accounts) {
    logger.info(account, "Processing account");
    const cloudFormationClient = new CloudFormationClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(account.accountId),
    });

    logger.info("Describing CloudFormation resources");
    const { StackResources } = await cloudFormationClient.send(
      new DescribeStackResourcesCommand({
        StackName: "CFNRegistryAWSAmplifyStack",
      })
    );

    if (!StackResources) {
      throw new Error(`No stack resources found in ${account.airportCode}`);
    }

    const kmsKey = StackResources.find(
      (resource) => resource.LogicalResourceId === "CfnContractTestsKey"
    );

    const bucket = StackResources.find(
      (resource) => resource.LogicalResourceId === "CfnContractTestsBucket"
    );

    const role = StackResources.find(
      (resource) => resource.LogicalResourceId === "CfnContractTestsRole"
    );

    if (!kmsKey || !bucket || !role) {
      logger.error(StackResources, "Resources not found in stack");
      throw new Error(`No stack resources found in ${account.airportCode}`);
    }

    // The bucket name is the physical resource id itself
    const s3BucketName = bucket.PhysicalResourceId!!;

    // The physical resource id for a KMS key is the ID, so we need to construct the ARN
    const kmsKeyArn = `arn:aws:kms:${account.region}:${
      account.accountId
    }:key/${kmsKey.PhysicalResourceId!!}`;

    // The physical resource id for a role is the name, so we need to construct the ARN
    const iamRoleArn = `arn:aws:iam::${
      account.accountId
    }:role/${role.PhysicalResourceId!!}`;

    const resources = {
      regionName: account.region,
      iamRoleArn,
      s3BucketName,
      kmsKeyArn,
    };

    logger.info(resources, "Found contract tests resources");
    contractTestResources.push(resources);
  }

  // Convert to YAML and save to file
  const outputFile = "testAccountsConfig.yml";
  logger.info(`Writing result to file ${outputFile}`);
  fs.writeFileSync(
    outputFile,
    yaml.dump({
      testAccounts: contractTestResources,
    })
  );
}

main()
  .then(() => logger.info("Done"))
  .catch((e) => logger.error(e));
