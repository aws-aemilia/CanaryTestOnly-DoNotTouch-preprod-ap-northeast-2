import {
  controlPlaneAccounts,
  dataPlaneAccounts,
  Region,
  Stage,
} from "./Isengard";

/**
 * Builds a CFN mapping of Hosting Gateway execution roles for all stages and regions. This mapping is meant to be copied on the Control Plane CFN at:
 * https://code.amazon.com/packages/AemiliaControlPlaneLambda/blobs/heads/mainline/--/configuration/cloudFormation/hosting_dataplane_mapping.template.yml
 *
 * Usage:
 * ts-node buildCFNHostingDataplaneMapping.ts
 */
const buildCFNHostingDataplaneMapping = async () => {
  const controlPlaneStages = ["test", "beta", "gamma", "preprod", "prod"];

  const controlPlaneRegions = (await controlPlaneAccounts({ stage: "prod" }))
    .map((acc) => acc.region)
    .sort();

  const cfnMap: {
    [region: string]: {
      [stage: string]: string;
    };
  } = {};

  for (const region of controlPlaneRegions) {
    for (const stage of controlPlaneStages) {
      cfnMap[region] = cfnMap[region] ?? {};

      const dataPlaneAccountsList = await dataPlaneAccounts({
        // preprod control plane uses gamma stack
        stage: (stage === "preprod" ? "gamma" : stage) as Stage,
        region: region as Region,
      });

      if (dataPlaneAccountsList.length > 1) {
        console.error(dataPlaneAccountsList);
        throw new Error(`Found more than 1 account for ${stage}:${region}`);
      }

      /**
       * This is to make sure CloudFormation fails during deployment for invalid ARN
       * just in case we missed that region+stage combination
       **/
      const noAccountMarker = "NO_ACCOUNT";

      const hostingGatewayRole =
        dataPlaneAccountsList.length > 0
          ? toExecutionRoleArn(stage, dataPlaneAccountsList[0].accountId)
          : noAccountMarker;

      cfnMap[region][stage] = hostingGatewayRole;
    }
  }

  const mappings = {
    Mappings: {
      HostingGatewayRoles: cfnMap,
    },
  };

  return JSON.stringify(mappings, null, 2);
};

/**
 * @returns role defined in https://code.amazon.com/packages/AWSAmplifyHostingDataplaneCDK/blobs/mainline/--/lib/gateway.ts
 */
const toExecutionRoleArn = (stage: string, accountId: string): string =>
  `arn:aws:iam::${accountId}:role/HostingGateway-${stage}-HostingGatewayExecutionRole`;

buildCFNHostingDataplaneMapping().then(console.error);
