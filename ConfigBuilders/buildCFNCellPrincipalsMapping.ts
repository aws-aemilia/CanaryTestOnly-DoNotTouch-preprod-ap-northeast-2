import {
  computeServiceDataPlaneAccounts,
  controlPlaneAccounts,
  Region,
  Stage,
} from "../Commons/Isengard";

/**
 * Builds a CFN mapping of Compute Service cell accounts for all stages and regions. This mapping is meant to be copied on the WebHookProcessor CFN at:
 * https://code.amazon.com/packages/AemiliaWebhookProcessorLambda/blobs/heads/mainline/--/configuration/cloudFormation/cell_principals_mapping.template.yml
 *
 * Usage:
 * ts-node buildCFNCellPrincipalsMapping.ts
 */
const buildCFNCellPrincipalsMapping = async () => {
  const stages = ["test", "beta", "gamma", "preprod", "prod"];
  // us-west-2 first just so that it shows first on the resulting JSON
  const regions = [
    "us-west-2",
    ...(await controlPlaneAccounts({ stage: "prod" })).map((acc) => acc.region),
  ];

  const noCellsMarker = "NO_CELLS";

  const cfnMap: {
    [region: string]: {
      [stage: string]: string[];
    };
  } = {};

  for (const region of regions) {
    for (const stage of stages) {
      cfnMap[region] = cfnMap[region] ?? {};
      cfnMap[region][stage] = cfnMap[region][stage] ?? [];

      const cellPrincipals = (
        await computeServiceDataPlaneAccounts({
          // preprod control plane uses gamma compute service stack
          stage: (stage === "preprod" ? "gamma" : stage) as Stage,
          region: region as Region,
        })
      ).map(
        (acc) =>
          `arn:aws:iam::${acc.accountId}:role/ComputeServiceCrossAccountRole`
      );

      cfnMap[region][stage] =
        cellPrincipals.length > 0 ? cellPrincipals : [noCellsMarker];
    }
  }

  const mappings = {
    Mappings: {
      ComputeCellPrincipalsMapping: cfnMap,
    },
  };

  // slightly convoluted use of CFN intrinsic functions
  // Join is needed since Equals only works with strings
  const conditions = {
    Conditions: {
      HasComputeCells: {
        "Fn::Not": [
          {
            "Fn::Equals": [
              noCellsMarker,
              {
                "Fn::Join": [
                  "-",
                  {
                    "Fn::FindInMap": [
                      "ComputeCellPrincipalsMapping",
                      { Ref: "AWS::Region" },
                      { Ref: "Stage" },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };

  return JSON.stringify({ ...mappings, ...conditions }, null, 2);
};

buildCFNCellPrincipalsMapping().then(console.log).catch(console.log);
