import {
  controlPlaneAccount,
  Region,
  Stage,
  preflightCAZ,
  getIsengardCredentialsProvider,
} from "../../Commons/Isengard";
import { toRegionName } from "../../Commons/utils/regions";
import { createLogger } from "../../Commons/utils/logger";

export function updateCommand({
  accountId,
  limitName,
  ripServiceName,
  regionName,
  value,
}: {
  accountId: string;
  limitName: string;
  ripServiceName: string;
  regionName: string;
  value: string;
}) {
  return `
/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva set-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${accountId} \\
    --value LimitType=SINGLE_VALUE,SingleValue=${value}

${getCommand({ accountId, limitName, ripServiceName, regionName })}
  `;
}

export function getCommand({
  accountId,
  limitName,
  ripServiceName,
  regionName,
}: {
  accountId: string;
  limitName: string;
  ripServiceName: string;
  regionName: string;
}) {
  return `
/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva get-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${accountId} \\
    --output json
  `;
}

function getRipServiceName(stage: string) {
  if (stage === "beta") {
    return "amplify/amplify_beta";
  } else if (stage === "gamma") {
    return "amplify/amplify_gamma";
  }

  return "amplify";
}

export async function prepareMinervaExecution({
  stage,
  region,
}: {
  stage: string;
  region: string;
}) {
  const regionName = toRegionName(region);

  const logger = createLogger("info");

  logger.info(`
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ THIS MUST BE RUN FROM A DEV DESKTOP WITH  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ aws-minerva (MAWS) INSTALLED              ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

    Docs link:
    https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HGettingstarted:SetupyourCloudDesktoptousetheMinervaCLI
    `);

  const ripServiceName = getRipServiceName(stage);

  const controlPlaneAccountResponse = await controlPlaneAccount(
    <Stage>stage,
    <Region>region
  );

  const sdcManagementRole = "SDCLimitManagement";

  await preflightCAZ({
    accounts: controlPlaneAccountResponse,
    role: sdcManagementRole,
  });

  const credentialsProvider = getIsengardCredentialsProvider(
    controlPlaneAccountResponse.accountId,
    sdcManagementRole
  );

  const credentials = await credentialsProvider();

  return { regionName, ripServiceName, credentials, logger };
}
