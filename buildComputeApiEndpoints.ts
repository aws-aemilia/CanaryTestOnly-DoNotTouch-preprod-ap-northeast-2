/**
 * Prints the Compute Service endpoints for all regions and stages in the format expected by AWSAmplifyDeploymentInfrastructureCDK,
 * AWSAmplifyComputeServiceTests, and AWSAmplifyComputeServiceClientConfig.
 *
 * Usage:
 * ts-node buildComputeApiEndpoints.ts
 */

import { AmplifyAccount, computeServiceControlPlaneAccounts } from "./commons/Isengard";
import { fetchCloudFormationOutputs } from "./commons/utils/cloudFormation";
import { capitalize } from "./commons/Isengard/createAccount/createAmplifyAccount";

type EndpointAccount = { endpoint: string; account: AmplifyAccount };

const getEndpoint = async (account: AmplifyAccount) => {
  const outputs = await fetchCloudFormationOutputs({
    amplifyAccount: account,
    outputKeys: ["ComputeServiceApiRestApiEndpoint"],
    stackName: `AWSAmplifyComputeService-${account.stage}`,
  });

  const apiId = outputs["ComputeServiceApiRestApiEndpoint"];

  return `https://${apiId}.execute-api.${account.region}.amazonaws.com/prod`;
};

const toIntegTestEndPointsMap = (
  endpoints: EndpointAccount[]
): Record<string, string> => {
  const endpointMap: Record<string, string> = {};

  for (const endpoint of endpoints) {
    endpointMap[`${endpoint.account.stage}-${endpoint.account.region}`] =
      endpoint.endpoint;
  }
  return endpointMap;
};

const toCoralConfig = (endpoints: EndpointAccount[]): string => {
  let config = "";

  for (const stage of ["beta", "gamma", "preprod", "prod"]) {
    const endpointAccounts = endpoints.filter(
      (x) => x.account.stage === (stage === "preprod" ? "gamma" : stage)
    );
    for (const endpoint of endpointAccounts) {
      config += `AWSAmplifyComputeService#Base.${endpoint.account.airportCode.toUpperCase()}.${capitalize(
        stage
      )} : {
  "httpEndpoint" : {
    "url" : "${endpoint.endpoint}"
  },
  "httpSigning" : {
    "region" : "${endpoint.account.region}",
    "scheme" : "aws4-hmac-sha256",
    "service" : "execute-api"
  }
}

`;
    }

    config += "====================================================\n\n\n";
  }

  return config;
};

const toDeploymentProcessorConfig = (endpoints: EndpointAccount[]): any => {
  const config: {
    [stage: string]: {
      [region: string]: {
        apiId: string;
        accountId: string;
      };
    };
  } = {};

  for (const stage of ["test", "beta", "gamma", "preprod", "prod"]) {
    const endpointAccounts = endpoints.filter(
      (x) =>
        x.account.stage ===
        (stage === "preprod" ? "gamma" : stage === "test" ? "beta" : stage)
    );
    for (const endpoint of endpointAccounts) {
      config[stage] = config[stage] ?? {};
      config[stage][endpoint.account.region] = {
        apiId: endpoint.endpoint.match(/https:\/\/([a-z0-9]+)\.execute.*/)![1],
        accountId: endpoint.account.accountId,
      };
    }
  }

  return config;
};

const buildComputeApiEndpoints = async () => {
  const accounts = await computeServiceControlPlaneAccounts();

  accounts.map(async (acc) => {
    return {
      account: acc,
      endpoint: await getEndpoint(acc),
    };
  });

  const endpoints: EndpointAccount[] = await Promise.all(
    accounts.map(async (acc) => {
      return {
        account: acc,
        endpoint: await getEndpoint(acc),
      };
    })
  );

  console.log("******** AWSAmplifyDeploymentInfrastructureCDK ********");
  console.log(JSON.stringify(toDeploymentProcessorConfig(endpoints), null, 2));

  console.log("******** AWSAmplifyComputeServiceTests ********");
  console.log(JSON.stringify(toIntegTestEndPointsMap(endpoints), null, 2));

  console.log("******** AWSAmplifyComputeServiceClientConfig ********");
  console.log(toCoralConfig(endpoints));
};

buildComputeApiEndpoints().then().catch(console.log);
