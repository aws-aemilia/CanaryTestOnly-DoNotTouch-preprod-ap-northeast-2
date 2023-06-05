
import yargs from "yargs";
import { Lambda } from "@aws-sdk/client-lambda";
import { controlPlaneAccounts, getIsengardCredentialsProvider } from "../Commons/Isengard";
import { getFunctionNameWithPrefix } from "../Commons/utils/lambda";

/**
 * Usage
 * npm run migrateToCloudFrontPolicies -- --stage prod --action migrateRegion --region us-west-2 --cachPolicyId 12345 --originRequestPolicyId 12345
 * npm run migrateToCloudFrontPolicies -- --stage prod --action rollbackRegion --region us-west-2
 */
const PROD_FRONT_END_RESOURCE_HANDLER_PREFIX = "AemiliaWarmingPool-FrontEndResourceWarmingPool-";
const LOCAL_FRONT_END_RESOURCE_HANDLER_PREFIX = 'sam-dev-jffranzo-AemiliaW-FrontEndResourceWarmingP-9VZUVO2NGPVJ';
const UNSET_ROLLBACK_VALUES = "UNSET";

const getFrontEndResourceHandlerPrefixForStage = (stage: string) => {
    switch (stage) {
        case 'local':
            return LOCAL_FRONT_END_RESOURCE_HANDLER_PREFIX;
        default:
            return PROD_FRONT_END_RESOURCE_HANDLER_PREFIX;
    }
}

const migrateRegion = async (lambda: Lambda, functionName: string, cachPolicyId: string, originRequestPolicyId: string) => {
    console.log(`updating env vars with cloudFront policy IDs for function: ${functionName}`);
    const functionConfig = await lambda.getFunctionConfiguration({
        FunctionName: functionName,
    });

    const newVars = {
        ...functionConfig.Environment!.Variables,
        CACHE_POLICY_ID: cachPolicyId,
        ORIGIN_REQUEST_POLICY_ID: originRequestPolicyId
    };

    console.log(`new Env Vars: ${JSON.stringify(newVars)}`);
    await lambda.updateFunctionConfiguration({
        FunctionName: functionName,
        Environment: {
            Variables: newVars
        }
    });

    console.log(`done updating environment variables for: ${functionName}`);
}

const rollbackRegion = async (lambda: Lambda, functionName: string) => {
    console.log(`rolling back env vars for function: ${functionName}`);
    const functionConfig = await lambda.getFunctionConfiguration({
        FunctionName: functionName,
    });

    const newVars = {
        ...functionConfig.Environment!.Variables,
        CACHE_POLICY_ID: UNSET_ROLLBACK_VALUES,
        ORIGIN_REQUEST_POLICY_ID: UNSET_ROLLBACK_VALUES
    };

    console.log(`new Env Vars: ${JSON.stringify(newVars)}`);
    await lambda.updateFunctionConfiguration({
        FunctionName: functionName,
        Environment: {
            Variables: newVars
        }
    });

    console.log(`done rolling back: ${functionName}`);
}

const main = async () => {
    const args = await yargs(process.argv.slice(2))
        .usage(
            `
          Populates the CACHE_POLICY_ID and ORIGIN_REQUEST_ID env vars for the FrontEndResource Handler with the correct policy IDs
          `
        )
        .option("stage", {
            describe: "stage to run the command",
            type: "string",
            choices: ["local", "beta", "gamma", "prod"],
            demandOption: true,
        })
        .option("action", {
            describe:
                "action to run",
            choices: ["migrateRegion", "rollbackRegion", "rollbackAll"],
            type: "string",
            demandOption: true
        })
        .option("cachPolicyId", {
            describe:
                "cachPolicyId to set",
            type: "string",
        })
        .option("originRequestPolicyId", {
            describe:
                "originRequestPolicyId to set",
            type: "string",
        })
        .option("region", {
            describe:
                "region to run the command",
            type: "string",
        })
        .strict()
        .version(false)
        .help().argv;
    const { stage, region, action, cachPolicyId, originRequestPolicyId } = args;
    const controlPLaneAccounts = (await controlPlaneAccounts()).filter((acc) => acc.stage === stage);
    if (!region) {
        throw new Error('no region was provided. please specifcy which region you want to migrate');
    }
    
    const migrateAccount = stage !== 'local' ? controlPLaneAccounts.find(account => account.region === region) : { accountId: '120804186529' };
    if (!migrateAccount) {
        throw new Error(`cannot find account for region ${region}`);
    }
    console.log(`Action: ${action} Stage: ${stage} Region: ${region} AccountId: ${migrateAccount.accountId}`);

    const lambda = new Lambda({
        region,
        credentials: getIsengardCredentialsProvider(migrateAccount.accountId, "OncallOperator")
    });
    const prefix = getFrontEndResourceHandlerPrefixForStage(stage);
    const functionName = await getFunctionNameWithPrefix(lambda, prefix);
    if (!functionName) {
        throw new Error('failed to get funcion name for the FrontEndResourceHandler. Cannot continue with the script.');
    }

    switch (action) {
        case "migrateRegion":
            if (!cachPolicyId || !originRequestPolicyId) {
                throw new Error(`cachPolicyId and originRequestPolicyId need to be set.`);
            }
            await migrateRegion(lambda, functionName, cachPolicyId, originRequestPolicyId);
            break;
        case "rollbackRegion":
            await rollbackRegion(lambda, functionName);
            break;
    }
};

main()
    .then()
    .catch((e) => {
        console.error("\nSomething went wrong");
        console.error(e);
    });
