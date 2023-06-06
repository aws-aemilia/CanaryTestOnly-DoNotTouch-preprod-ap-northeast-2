import {
  computeServiceControlPlaneAccounts,
  controlPlaneAccounts,
  Region,
  Stage,
} from "../commons/Isengard";

const toExecuteApiResource = (region: string, accountId: string): string =>
  `arn:aws:execute-api:${region}:${accountId}:*`;

/**
 * Builds a CFN mapping of Compute Service APIs for all stages and regions. This mapping is meant to be copied on the Control Plane CFN at:
 * https://code.amazon.com/packages/AemiliaControlPlaneLambda/blobs/heads/mainline/--/configuration/cloudFormation/compute_service_api_mapping.template.yaml
 *
 * Usage:
 * ts-node buildCFNComputeApiMapping.ts
 */
const buildCFNComputeApiMapping = async () => {
  const stages = ["test", "beta", "gamma", "preprod", "prod"];
  // us-west-2 first just so that it shows first on the resulting JSON
  const regions = [
    "us-west-2",
    ...(await controlPlaneAccounts({ stage: "prod" })).map((acc) => acc.region),
  ];

  const noAccountMarker = "NO_ACCOUNT";

  const cfnMap: {
    [region: string]: {
      [stage: string]: string;
    };
  } = {};

  for (const region of regions) {
    for (const stage of stages) {
      cfnMap[region] = cfnMap[region] ?? {};

      const computeServiceApis = (
        await computeServiceControlPlaneAccounts({
          // preprod control plane uses gamma compute service stack
          stage: (stage === "preprod" ? "gamma" : stage) as Stage,
          region: region as Region,
        })
      ).map((acc) => toExecuteApiResource(acc.region, acc.accountId));

      cfnMap[region][stage] =
        computeServiceApis.length > 0 ? computeServiceApis[0] : noAccountMarker;
    }
  }

  const mappings = {
    Mappings: {
      ComputeServiceAPIs: cfnMap,
    },
  };

  return JSON.stringify(mappings, null, 2);
};

buildCFNComputeApiMapping().then(console.log).catch(console.log);
