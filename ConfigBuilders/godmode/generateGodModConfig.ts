import fs from "fs";
import {
  computeServiceControlPlaneAccounts,
  computeServiceDataPlaneAccounts,
  dataPlaneAccounts,
  integTestAccounts,
} from "../../Commons/Isengard";
import godModeConfig from "./config.json";

/**
 * Overview

 * Our Runbooks work based on the GodMode configuration outlined in this wiki:
 * https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/AemiliaGodModeParams. Every Runbook references
 * that wiki using a transclude macro. This script generates that configuration based on the current state of our
 * service accounts.
 *
 * Instructions
 *
 * 1. Run the script `npx ts-node generateGodModConfig.ts`.
 * 2. An updated config.json file will be generated in the same directory.
 * 3. Go to the wiki above and update it with the new generated config.json content.
 * 4. Commit the updated config.json to the repo and send a CR to the team.
 *
 * Note: This script only updates the ComputeService config for now. The configs for the rest of the
 * services are not yet auto generated.
 *
 * Note: There is a bunch of ts-ignore in this script, that's because GodMode config is an arbitrary JSON object
 * that can be as flexible as necessary. Every service defines their own properties and structure. Not ideal, but
 * it is what it is.
 *
 */

const main = async () => {
  let updatedConfig = await generateComputeServiceConfig(godModeConfig);
  updatedConfig = await generateHostingGatewayConfig(godModeConfig);
  updatedConfig = await generateIntegrationTestsConfig(godModeConfig);
  writeConfig(updatedConfig);
};

const generateComputeServiceConfig = async (godModeConfig: any) => {
  const accounts = await computeServiceControlPlaneAccounts({ stage: "prod" });
  const cellAccounts = await computeServiceDataPlaneAccounts({ stage: "prod" });
  const computeServiceConfig = {
    parameters: {},
  } as any;

  accounts.forEach((account) => {
    const airportCode = account.airportCode.toUpperCase();
    const cells = cellAccounts.filter(
      (cellAccount) => cellAccount.airportCode === account.airportCode
    );

    // Add main compute service account
    computeServiceConfig.parameters[airportCode] = {
      account: account.accountId,
      // We can add more parameters here for each account to be used in Runbooks, for example,
      // log group names or dynamodb table names.
    };

    // Add cell accounts
    cells.forEach((cell) => {
      computeServiceConfig.parameters[
        `${airportCode} - Cell${cell.cellNumber}`
      ] = {
        account: cell.accountId,
        // Add more parameters here if needed for each cell account to be used in Runbooks
      };
    });
  });

  // @ts-ignore
  godModeConfig.services["AmplifyComputeService"] = computeServiceConfig;
  return godModeConfig;
};

const generateHostingGatewayConfig = async (godModeConfig: any) => {
  const accounts = await dataPlaneAccounts();
  const config = {
    parameters: {},
  } as any;

  accounts.forEach((account) => {
    const airportCode = account.airportCode.toUpperCase();
    const key =
      account.stage === "prod"
        ? airportCode
        : `${airportCode} - ${account.stage}`;
    config.parameters[key] = {
      account: account.accountId,
      stage: account.stage,
    };
  });

  // @ts-ignore
  godModeConfig.services["AmplifyHostingGatewayService"] = config;
  return godModeConfig;
};

const generateIntegrationTestsConfig = async (godModeConfig: any) => {
  const accounts = await integTestAccounts({ stage: "prod" });
  const config = {
    parameters: {},
  } as any;

  accounts.forEach((account) => {
    const airportCode = account.airportCode.toUpperCase();
    config.parameters[airportCode] = {
      account: account.accountId,
    };
  });

  // @ts-ignore
  godModeConfig.services["AmplifyIntegrationTests"] = config;
  return godModeConfig;
};

const writeConfig = (config: any) => {
  fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
