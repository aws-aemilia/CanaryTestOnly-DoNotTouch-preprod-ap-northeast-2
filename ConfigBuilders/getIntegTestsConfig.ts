import {
  aesIntegTestAccounts,
  AmplifyAccount,
  controlPlaneAccounts,
  integTestAccounts,
  meteringAccounts,
} from "../Commons/Isengard";
import { getCloudFormationOutputs } from "../Commons/utils/cloudFormation";
import sleep from "../Commons/utils/sleep";

/**
 * Get the config values needed by Integ tests for all regions and stages
 */
const getIntegTestsConfig = async () => {
  const accounts = await controlPlaneAccounts();
  const allResults = await Promise.allSettled(
    accounts.map(async (a) => {
      try {
        return await getCfnOutputs(a);
      } catch (err) {
        console.log("FAILED", a.email);
        console.log(err);
        throw err;
      }
    })
  );

  const successfulResults = allResults.flatMap((x) => {
    if (x.status === "rejected") {
      return [];
    }
    return [x.value];
  });

  const webHookEndpoints: Record<string, string> = {};
  const endpoints: Record<string, string> = {};
  const webPreviewEndpoints: Record<string, string> = {};

  successfulResults.forEach((account) => {
    webHookEndpoints[`${account.stage}.${account.region}.webHookEndpoint`] =
      account.webHookEndpoint;
    endpoints[`${account.stage}.${account.region}.endpoint`] = account.endpoint;
    webPreviewEndpoints[
      `${account.stage}.${account.region}.webPreviewEndpoint`
    ] = account.webPreviewEndpoint;
  });

  console.log("//======== endpoints =========");
  console.log(toJavaMapBuilderPut(endpoints));
  console.log("//======== webHookEndpoints =========");
  console.log(toJavaMapBuilderPut(webHookEndpoints));
  console.log("//======== webPreviewEndpoints =========");
  console.log(toJavaMapBuilderPut(webPreviewEndpoints));

  const integTestaccounts = await integTestAccounts();

  const testAccounts: Record<string, string> = {};

  integTestaccounts.forEach((account) => {
    testAccounts[`${account.stage}.${account.region}.integTestAccountId`] =
      account.accountId;
  });

  console.log("//======== integrationTestAccounts =========");
  console.log(toJavaMapBuilderPut(testAccounts));

  const aesIntegTestaccounts = await aesIntegTestAccounts();

  const aesTestAccounts: Record<string, string> = {};

  aesIntegTestaccounts.forEach((account) => {
    aesTestAccounts[
      `${account.stage}.${account.region}.aesIntegTestAccountId`
    ] = account.accountId;
  });

  console.log("//======== aesIntegrationTestAccounts =========");
  console.log(toJavaMapBuilderPut(aesTestAccounts));

  const controlPlaneAccountIds: Record<string, string> = {};

  accounts.forEach((account) => {
    controlPlaneAccountIds[
      `${account.stage}.${account.region}.controlPlaneAccountId`
    ] = account.accountId;
  });

  console.log("//======== controlPlaneAccounts =========");
  console.log(toJavaMapBuilderPut(controlPlaneAccountIds));

  console.log("//======== meteringAccounts =========");
  const meteringAccountIds: Record<string, string> = {};
  (await meteringAccounts()).forEach((account) => {
    meteringAccountIds[`${account.stage}.${account.region}.meteringAccountId`] =
      account.accountId;
  });
  console.log(toJavaMapBuilderPut(meteringAccountIds));
};

/**
 * Formats an object as a series of Map.put() statements. Useful for copy-pasting objects to Java.
 */
const toJavaMapBuilderPut = (m: Record<string, string>): string => {
  let output = "";
  Object.entries(m).forEach(([k, v]) => {
    output += `.put("${k}", "${v}")\n`;
  });
  return output;
};

const getCfnOutputs = async (amplifyAccount: AmplifyAccount) => {
  const { ApiId, ApiStage } = await getCloudFormationOutputs({
    amplifyAccount: amplifyAccount,
    outputKeys: ["ApiId", "ApiStage"],
    stackName: "AemiliaControlPlaneLambda",
  });

  sleep(2000);

  const { WebhookProcessorAPIId, WebPreviewAPIId } =
    await getCloudFormationOutputs({
      amplifyAccount: amplifyAccount,
      outputKeys: ["WebhookProcessorAPIId", "WebPreviewAPIId"],
      stackName: "AemiliaWebhookProcessorLambda",
    });

  return {
    region: amplifyAccount.region,
    stage: amplifyAccount.stage,
    endpoint: `https://${ApiId}.execute-api.${amplifyAccount.region}.amazonaws.com/${ApiStage}/`,
    webHookEndpoint: `https://${WebhookProcessorAPIId}.execute-api.${amplifyAccount.region}.amazonaws.com/prod`,
    webPreviewEndpoint: `https://${WebPreviewAPIId}.execute-api.${amplifyAccount.region}.amazonaws.com/prod`,
  };
};

getIntegTestsConfig().then().catch(console.log);
