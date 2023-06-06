import {
  AmplifyAccount,
  AmplifyAccountType,
  getAccountsLookupFn,
  getIsengardCredentialsProvider,
  Region,
  Stage,
  StandardRoles
} from "../commons/Isengard";
import { RequestServiceQuotaIncreaseCommandInput, ServiceQuotas } from "@aws-sdk/client-service-quotas";
import { createLogger } from "../commons/utils/logger";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

const logger = createLogger();

async function getArgs() {
  return yargs(hideBin(process.argv))
      .usage(`
        Request Service Quotas limit increases in bulk for Amplify service accounts.
        
        Example:
        # Increase the CloudWatch Contributor Insights limit in Control Plane and Data Plane accounts to 200.
        ts-node requestServiceQuotaIncrease \\
          --accountType controlPlane dataPlane \\
          --serviceCode monitoring \\
          --quotaCode L-DBD11BCC \\
          --desiredValue 200
      `)
      .option("accountTypes", {
        describe: `The Amplify service account types to request the limit increase in, e.g. "controlPlane", "dataPlane".
        You may supply multiple values to this option.`,
        type: "array",
        choices: Object.values(AmplifyAccountType),
        demandOption: true,
        alias: "at"
      })
      .option("serviceCode", {
        describe: `The AWS service to request the limit increase from, e.g. "monitoring", "kinesis", "lambda".`,
        type: "string",
        demandOption: true,
        alias: "sc",
      })
      .option("quotaCode", {
        describe: `The quota code of the limit to increase, e.g. "L-DBD11BCC".`,
        type: "string",
        demandOption: true,
        alias: "qc"
      })
      .option("desiredValue", {
        describe: "The desired value of the limit.",
        type: "number",
        demandOption: true,
        alias: "dv"
      })
      .option("stage", {
        describe: `The stage to request the limit increase in, e.g. "prod", "beta".`,
        type: "string",
        options: ["beta", "gamma", "preprod", "prod"],
        alias: "s"
      })
      .option("region", {
        describe: `The region to request the limit increase in, e.g. "pdx", "us-east-1".`,
        type: "string",
        alias: "r"
      })
      .strict()
      .version(false)
      .help().argv
}

async function getAllAccounts(accountTypes: AmplifyAccountType[], stage: Stage, region: Region) {
  const accounts: AmplifyAccount[] = [];
  for (const accountType of accountTypes) {
    const moreAccounts = await getAccountsLookupFn[accountType]({stage, region});
    accounts.push(...moreAccounts);
  }
  return accounts;
}

// NonNullableProps<T> is a generic type that, given an object type T, applies NonNullable<T> to all
// properties and sub-properties of T.
type NonNullableProps<T> = { [P in keyof T]: T[P] extends object ? NonNullableProps<T[P]> : NonNullable<T[P]>; };

async function requestQuotaIncrease(account: AmplifyAccount, request: NonNullableProps<RequestServiceQuotaIncreaseCommandInput>) {
  const credentials = getIsengardCredentialsProvider(
      account.accountId,
      StandardRoles.OncallOperator
  )
  const serviceQuotas = new ServiceQuotas({
    credentials,
    region: account.region,
  });

  try {
    const getServiceQuotaCommandOutput = await serviceQuotas.getServiceQuota(request);
    const currentQuotaValue = getServiceQuotaCommandOutput.Quota?.Value ?? 0;
    const quotaName = getServiceQuotaCommandOutput.Quota?.QuotaName ?? "";
    logger.info(`Requesting ${quotaName} limit increase for ${account.email}...`);

    if (currentQuotaValue < request.DesiredValue) {
      await serviceQuotas.requestServiceQuotaIncrease(request);
      logger.info(`...done.`);
    } else {
      logger.info(`...quota is already at or above the desired value, skipping.`);
    }

  } catch (e) {
    logger.error(`Failed to increase quota for ${account.email}:`);
    logger.error(e);
  }
}

async function main() {
  const args = await getArgs();
  const {
    accountTypes,
    serviceCode,
    quotaCode,
    desiredValue,
  } = args;
  const region = args.region as Region;
  const stage = args.stage as Stage;

  const accounts = await getAllAccounts(accountTypes, stage, region);

  const request = {
    ServiceCode: serviceCode,
    QuotaCode: quotaCode,
    DesiredValue: desiredValue
  };

  for (const account of accounts) {
    await requestQuotaIncrease(account, request);
  }
}

main().catch(console.error)
