import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Credentials, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  dataPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Isengard";
import confirm from "../utils/confirm";
import {
  fetchDistribution,
  getDistributionsForApp,
} from "./distributionsUtils";

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Migrates the given app to use HostingGateway instead of Lambda@Edge functions for featurs like Basic Auth, Custom Rules and headers.
This is meant to be used one-off migration of developer apps/integration test apps. Customer applications may use a more automated mechanism in the future.

Usage:
ada credentials update --account=$AWS_ACCOUNT_ID --role=admin --once
ts-node hostingGatewayMigrator.ts --appId=d36vtia1ezp4ol --stage=test --alias=$(whoami) --region=us-west-2


ts-node hostingGatewayMigrator.ts --appId=d36vtia1ezp4ol --stage=prod --alias=$(whoami) --region="ca-central-1"
`
    )
    .option("stage", {
      describe: "test, beta, gamma or prod",
      type: "string",
      demandOption: true,
      default: "test",
      choices: ["test", "beta", "gamma", "prod"],
    })
    .option("region", {
      describe: "i.e. us-west-2",
      type: "string",
      demandOption: true,
    })
    .option("appId", {
      describe: "Distribution to migrate",
      type: "string",
      demandOption: true,
    })
    .option("alias", {
      describe: "Your alias ",
      type: "string",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  let { stage, region, appId, alias } = args;

  if (stage === "test" && !alias) {
    throw new Error("--alias argument must be provided with stage=test");
  }

  let controlplaneCredentials: Provider<Credentials> | undefined;
  let dataplaneCredentials: Provider<Credentials> | undefined;

  // Test accounts should use ada credentials update --account --role
  if (stage !== "test") {
    const cpAccount = await controlPlaneAccount(
      stage as Stage,
      region as Region
    );
    controlplaneCredentials = getIsengardCredentialsProvider(
      cpAccount.accountId,
      "OncallOperator"
    );
    const dpAccount = await dataPlaneAccount(stage as Stage, region as Region);
    dataplaneCredentials = getIsengardCredentialsProvider(
      dpAccount.accountId,
      "ReadOnly"
    );
  }

  const dynamodb = getDdbClient(region, controlplaneCredentials);
  const cfClient = new CloudFront({
    region,
    credentials: controlplaneCredentials,
  });

  const cfnClient = new CloudFormationClient({
    region,
    credentials: dataplaneCredentials,
  });

  const hostingGatewayURL = await getCloudFormationOutput(
    cfnClient,
    stage === "test" ? `HostingGateway-${alias}` : `HostingGateway-${stage}`,
    "HostingGatewayURL"
  );

  if (!hostingGatewayURL) {
    throw new Error("hostingGatewayURL not found");
  }

  const { hostname: hostingGatewayDomain, protocol: hostingGatewayProtocol } =
    new URL(hostingGatewayURL);

  const appDistributions = await getDistributionsForApp(
    dynamodb,
    stage,
    region,
    appId
  );

  for (let distId of appDistributions) {
    const { distributionConfig, eTag } = await fetchDistribution(
      cfClient,
      distId
    );
    const originId = "HostingGatewayALB";

    distributionConfig.Origins!.Quantity = 1;
    distributionConfig.Origins!.Items = [
      {
        Id: originId,
        DomainName: hostingGatewayDomain,
        OriginPath: "",
        CustomOriginConfig: {
          HTTPPort: 80,
          HTTPSPort: 443,
          OriginProtocolPolicy:
            hostingGatewayProtocol === "https:" ? "https-only" : "http-only",
          OriginSslProtocols: { Quantity: 1, Items: ["TLSv1.2"] },
          OriginReadTimeout: 60,
          OriginKeepaliveTimeout: 60,
        },
        CustomHeaders: {
          Quantity: 1,
          Items: [
            {
              HeaderName: "x-amplify-app-id",
              HeaderValue: appId,
            },
          ],
        },
      },
    ];
    distributionConfig.DefaultCacheBehavior!.TargetOriginId = originId;
    distributionConfig.DefaultCacheBehavior!.LambdaFunctionAssociations = {
      Items: [],
      Quantity: 0,
    };

    console.info(
      "Updating Distribution",
      JSON.stringify(distributionConfig, undefined, 2)
    );

    if (
      await confirm(
        "Do you want to update the distribution with the above config?"
      )
    ) {
      await cfClient.updateDistribution({
        Id: distId,
        IfMatch: eTag,
        DistributionConfig: distributionConfig,
      });
      console.info("Successfully updated the distribution", distId);
    }
  }
};

export const getCloudFormationOutput = async (
  client: CloudFormationClient,
  stackName: string,
  outputKey: string
): Promise<string | undefined> => {
  console.log("Fetching CloudFormation stack", stackName);
  const describeResponse = await client.send(
    new DescribeStacksCommand({
      StackName: stackName,
    })
  );

  const stack = describeResponse.Stacks?.find(
    (stack) => stack.StackName === stackName
  );
  if (!stack) {
    console.log("CloudFormation stack not found", stack);
    return undefined;
  }

  const output = stack.Outputs?.find(
    (output) => output.OutputKey === outputKey
  );
  if (!output) {
    console.log("CloudFormation stack output not found", stackName, outputKey);
    return undefined;
  }

  console.log(
    `CloudFormation stack output ${outputKey} found = ${output.OutputValue}`
  );
  return output.OutputValue;
};

function getDdbClient(region: string, credentials?: Provider<Credentials>) {
  const dynamodbClient = new DynamoDBClient({ region, credentials });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
