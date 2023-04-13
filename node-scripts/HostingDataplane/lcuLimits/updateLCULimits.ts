import { exec as execNonPromise } from "child_process";
import yargs from "yargs";
import pino from "pino";
import pinoPretty from "pino-pretty";
import util from "util";
import {
  dataPlaneAccounts,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import { Credentials } from "aws-sdk";
import confirm from "../../utils/confirm";

/* 
    LCU Limit increase process as described in wiki:
    https://w.amazon.com/bin/view/ELB/Onboarding/ELB_Scaling_Deep_Dive/#HTakingcontrolofELBScaling28ProvisionedCapacityforELB29
*/

const logger = pino(pinoPretty());

const exec = util.promisify(execNonPromise);

const executeCommand = async (command: string): Promise<string> => {
  try {
    const { stdout, stderr } = await exec(command);
    return stdout;
  } catch (e) {
    console.log(`Failed to run command: ${command}`);
    throw e;
  }
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
    Update LCU limit for ALB:

    # This will loop through all prod regions and update the LCU limit to 2000
    npx ts-node updateLCULimits.ts --stage prod --lcu 2000 --ticket P123456789

    # This will update the LCU limit to 2000 for the region us-west-2 in prod
    npx ts-node updateLCULimits.ts --stage prod --region us-west-2 --lcu 2000 --ticket P123456789
    `
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
    })
    .option("lcu", {
      describe: "LCU limit to update to",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, lcu, ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  logger.info("Configuring API for AWS CLI...");
  const configureAPICommand = `aws configure add-model --service-model file://0108342309_1546559420_2015-12-01.normal_updated.json --service-name elbv2_pc`;
  logger.info(configureAPICommand);
  await executeCommand(configureAPICommand);

  logger.info(`Getting accounts for stage: ${stage}`);
  const dataPlaneAccountsList = await dataPlaneAccounts({
    stage: stage as Stage,
  });
  for (const dataplaneAccounts of dataPlaneAccountsList) {
    const currentRegion = dataplaneAccounts.region;
    if (region && currentRegion !== region) {
      // if user provides `region`,
      // then skip other regions till we find the region they specified
      continue;
    }

    const regionStageDataPlaneAccount = await dataPlaneAccounts({
      stage: stage as Stage,
      region: currentRegion as Region,
    });
    if (regionStageDataPlaneAccount.length > 1) {
      console.error(regionStageDataPlaneAccount);
      throw new Error(`Found more than 1 account for ${stage}:${region}`);
    }

    const dataPlaneAccount = regionStageDataPlaneAccount[0];
    logger.info(
      `Fetching credentials for account: ${JSON.stringify(dataPlaneAccount)}`
    );
    const credentialsProvider = getIsengardCredentialsProvider(
      dataPlaneAccount.accountId,
      "OncallOperator"
    );
    const envCreds = await credentialsProvider.apply(
      (cred: Credentials) => cred.accessKeyId
    );
    process.env.AWS_ACCESS_KEY_ID = envCreds.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = envCreds.secretAccessKey;
    process.env.AWS_SESSION_TOKEN = envCreds.sessionToken;

    logger.info(`Fetching ALBs to update...`);
    const describeCommand = `aws elbv2_pc describe-load-balancers --region ${currentRegion}`;
    logger.info(describeCommand);
    const describeLoadBalancersResult = await executeCommand(describeCommand);
    const loadBalancers = JSON.parse(describeLoadBalancersResult).LoadBalancers;
    const loadBalancerArns: string[] = loadBalancers.map(
      (lb: any) => lb.LoadBalancerArn
    );
    logger.info(loadBalancerArns);

    for (const loadBalancerArn of loadBalancerArns) {
      if (loadBalancerArn.includes("Hosti-Hosti-")) {
        // Skipp ComputeService ALBs, we don't want to update their LCU limit
        continue;
      }

      logger.info(`Current LCU Limits for ALB: ${loadBalancerArn}`);
      const describeLCUCommand = `aws elbv2_pc describe-provisioned-capacity --load-balancer-arn ${loadBalancerArn} --region ${currentRegion}`;
      const describeLCUResult = await executeCommand(describeLCUCommand);
      logger.info(describeLCUResult);

      const proceedAccounts = await confirm(
        `Do you want to update LCU limit to ${lcu} for ALB: ${loadBalancerArn}`
      );
      if (proceedAccounts) {
        logger.info(`Modifying LCU limit for ALB: ${loadBalancerArn}`);
        const modifyLCUCommand = `aws elbv2_pc modify-provisioned-capacity --load-balancer-arn ${loadBalancerArn} --minimum-lb-capacity-units ${lcu} --region ${currentRegion}`;
        logger.info(modifyLCUCommand);
        const modifyLCUResult = await executeCommand(modifyLCUCommand);
        logger.info(modifyLCUResult);
      }
    }

    logger.info("Removing credentials");
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    delete process.env.AWS_SESSION_TOKEN;

    logger.info(
      `Done updating LCU limit for ALBs in region: ${currentRegion} and account: ${dataPlaneAccount.accountId}`
    );
  }

  logger.info(`Done updating LCU limit for all regions.`);
  process.exit(0);
};

main()
  .then()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
