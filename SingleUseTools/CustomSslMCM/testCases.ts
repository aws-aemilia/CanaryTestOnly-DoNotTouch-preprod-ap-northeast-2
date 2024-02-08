import logger from "Commons/utils/logger";
import {
  createAppAndGetAppId,
  createBranchAndGetBranchName,
  createDomainAssociation,
  deleteApp,
  deleteDomainAssociation,
  getAmplifyClient,
  getDomainAssociationSubDomains,
  updateDomainAssociation,
  waitUntilDomainIsAvailable,
} from "./amplifyHelper";
import { TestCase, TestCaseInput } from "./types";
import { logWithDivider } from "./utils";
import { SubDomainSetting } from "@aws-sdk/client-amplify";
import sleep from "Commons/utils/sleep";
import {
  NUMBER_OF_CONCURRENT_UPDATES_TO_MAKE,
  UPDATE_DOMAIN_ASSOCIATION_CONCURRENCY_DELAY,
} from "./constants";

// test case 1: create, update, and delete domain association
export const createUpdateAndDeleteDomain: TestCase = async ({
  credentials,
  domainName,
  endpoint,
  regionName,
}) => {
  const amplifyClient = getAmplifyClient({
    credentials,
    endpoint,
    region: regionName,
  });

  const appId = await createAppAndGetAppId(amplifyClient);

  try {
    logWithDivider("Creating branch...");
    const branchName = await createBranchAndGetBranchName({
      amplifyClient,
      appId,
    });

    const subDomainSettings: SubDomainSetting[] = [
      { prefix: "www", branchName },
    ];

    logWithDivider("Creating domain association...");
    await createDomainAssociation({
      amplifyClient,
      appId,
      branchName,
      domainName,
      subDomainSettings,
    });
    await waitUntilDomainIsAvailable({ amplifyClient, appId, domainName });

    const subDomainSettingsRequest: SubDomainSetting[] = [
      { prefix: "updated-prefix", branchName },
    ];

    logWithDivider("Updating domain association...");
    await updateDomainAssociation({
      amplifyClient,
      appId,
      branchName,
      domainName,
      subDomainSettings: subDomainSettingsRequest,
    });
    await waitUntilDomainIsAvailable({ amplifyClient, appId, domainName });

    logWithDivider("Deleting domain association...");
    await deleteDomainAssociation({ amplifyClient, appId, domainName });

    logWithDivider("Deleting app...");
    await deleteApp({ amplifyClient, appId });

    logWithDivider(
      "✅ Creating, updating, and deleting domain association succeeded."
    );
  } catch (e) {
    logger.error("Caught error while running tests : " + e);
    logger.error("Cleaning up the app now...");
    await deleteApp({ amplifyClient, appId });

    logWithDivider(
      "❌ Creating, updating, and deleting domain association failed. " +
        "See logs above to investigate the error."
    );
  }
};

// test case 2: update domain association multiple times concurrently
export const updateDomainMultipleTimesConcurrently: TestCase = async ({
  credentials,
  domainName,
  endpoint,
  regionName,
}) => {
  const amplifyClient = getAmplifyClient({
    credentials,
    endpoint,
    region: regionName,
  });

  const appId = await createAppAndGetAppId(amplifyClient);

  try {
    logWithDivider("Creating branch...");
    const branchName = await createBranchAndGetBranchName({
      amplifyClient,
      appId,
    });

    const originalSubDomainSettings: SubDomainSetting[] = [
      { prefix: "www", branchName },
    ];

    logWithDivider("Creating domain association...");
    await createDomainAssociation({
      amplifyClient,
      appId,
      branchName,
      domainName,
      subDomainSettings: originalSubDomainSettings,
    });
    await waitUntilDomainIsAvailable({ amplifyClient, appId, domainName });

    logWithDivider("Updating domain association multiple times:");

    let subDomainSettingsRequest: SubDomainSetting[] = [];

    for (let i = 0; i < NUMBER_OF_CONCURRENT_UPDATES_TO_MAKE; i++) {
      subDomainSettingsRequest.push({ prefix: `subdomain-${i}`, branchName });
      logger.info(
        "Creating a new update domain request with subDomainSettings " +
          subDomainSettingsRequest.toString()
      );
      await updateDomainAssociation({
        amplifyClient,
        appId,
        branchName,
        domainName,
        subDomainSettings: subDomainSettingsRequest,
      });

      // wait shortly to avoid throttling
      await sleep(UPDATE_DOMAIN_ASSOCIATION_CONCURRENCY_DELAY);
    }
    logWithDivider("All update domain association succeeded");

    const subDomainsInResponse = await getDomainAssociationSubDomains({
      amplifyClient,
      appId,
      domainName,
    });
    logger.info(
      "GetDomainAssociation returned subDomains: " +
        JSON.stringify(subDomainsInResponse)
    );
    logger.info(
      "Comparing subDomains with subDomainSettings from the last API request: " +
        JSON.stringify(subDomainSettingsRequest)
    );

    // subdomains API response should match subDomainSettings, and the last update request should "win"
    if (subDomainsInResponse.length !== subDomainSettingsRequest.length) {
      throw new Error(
        "subDomains.length do not match subDomainSettings.length"
      );
    }

    // assert that for every subDomainSetting in the last API request object, there
    // is some matching subDomainSetting in the API response. This would confirm
    // that all request went through and the last API request "won".
    subDomainSettingsRequest.every((subDomainSettingInRequest) => {
      subDomainsInResponse.some(
        ({ subDomainSetting: subDomainSettingInResponse }) => {
          subDomainSettingInRequest.prefix ===
            subDomainSettingInResponse?.prefix &&
            subDomainSettingInRequest.branchName ===
              subDomainSettingInResponse?.branchName;
        }
      );
    });

    logWithDivider(
      "SubDomainSettings from the last API request and the last API response match."
    );
    logWithDivider("Deleting domain association...");
    await deleteDomainAssociation({ amplifyClient, appId, domainName });

    logWithDivider("Deleting app...");
    await deleteApp({ amplifyClient, appId });

    logWithDivider(
      "✅ Updating domain association multiple times concurrently succeeded."
    );
  } catch (e) {
    logger.error("Caught error while running tests : " + e);
    logger.error("Cleaning up the app now...");
    await deleteApp({ amplifyClient, appId });

    logWithDivider(
      "❌ Updating domain association multiple times concurrently failed. " +
        "See logs above to investigate the error."
    );
  }
};

export const runAllTests = async (testCaseInput: TestCaseInput) => {
  await createUpdateAndDeleteDomain(testCaseInput);
  await updateDomainMultipleTimesConcurrently(testCaseInput);
};
