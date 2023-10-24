import { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import {
  CloudFront,
  DistributionConfig,
  NoSuchDistribution,
} from "@aws-sdk/client-cloudfront";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  Region,
  Stage,
  controlPlaneAccount,
  controlPlaneAccounts,
  dataPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
} from "../../Commons/Isengard";
import { WarmResourcesDAO } from "../../Commons/dynamodb/tables/WarmResourcesDAO";
import { getCloudFormationOutput } from "./cfnUtils";
import {
  fetchDistribution,
  getDistributionsForApp,
} from "./distributionsUtils";
import { getDomainName } from "../hostingDataplane/utils/utils";
import sleep from "../../Commons/utils/sleep";

const appsToMigrate: [string, string][] = [
  // Migrated
  ["ap-northeast-1", "d2ahb6fw9m261f"], // Not migrated: let look at later
  ["us-east-2", "dpc0s5z7x61u5"], // Not migrated: Has a ghost distribution in DB
  ["ap-northeast-1", "dxquitbw9v05f"], // migrated. still has ssrDistributionId in edge config
  ["ap-northeast-1", "d2f295yjg2oquc"], // Migrated
  ["us-east-1", "d3i0vite728ahe"], // migrated: Has a ghost distribution in DB
  ["ap-northeast-1", "d2lgvs0bya4x7d"],
  ["ap-northeast-1", "d2yx9b2f16yk66"],
  ["ap-northeast-1", "d36awtcz4780qe"],
  ["ap-northeast-1", "dwraptcihcwad"],
  ["ap-northeast-1", "d3fjie2twtds71"],
  ["ap-northeast-1", "dq69z4rn2qwqs"],
  ["ap-northeast-1", "d2g7jaxy6bzj8q"],
  ["ap-northeast-1", "d13v1t4a1cggk2"],
  ["ap-northeast-1", "d1k6hdv6vqfkpk"],
  ["ap-northeast-2", "dua0c0uw6lzra"],
  ["ap-south-1", "d1j481dpnhxvrs"],
  ["ap-south-1", "dzryx9atr4xgu"],
  ["ap-south-1", "d2fnw4qb0zv5x4"],
  ["ap-south-1", "dukwc9t6z313g"],
  ["ap-south-1", "dwzyfhaq0gzb6"],
  ["ap-south-1", "dycsxc4yjwwtj"],
  ["ap-south-1", "d3k4n880hbvmjg"],
  ["ap-southeast-1", "d15yrjxp03trxg"],
  ["ap-southeast-1", "d3a1dsubj0thhy"],
  ["ap-southeast-1", "d3rj4gq78a5ct0"],
  ["ap-southeast-1", "d34pjfm9nwdgzh"],
  ["ap-southeast-1", "dyc14868cpahq"],
  ["ap-southeast-1", "d2achqer15cv6v"],
  ["ap-southeast-2", "d29buo0feikwd0"],
  ["ap-southeast-2", "d25map6rucxofa"],
  ["ap-southeast-2", "d3s0h09bfjd8t6"],
  ["ap-southeast-2", "d2jg5l2a2v0wpu"],
  ["ap-southeast-2", "d3uh7k236pl1se"],
  ["ap-southeast-2", "d25to4oi6g0vnc"],
  ["ca-central-1", "d2xx9wnssgh7xi"],
  ["ca-central-1", "d3v0m02m7zicn2"],
  ["ca-central-1", "dyzc8t10ej2ke"],
  ["ca-central-1", "d7qo01os3o5wg"],
  ["eu-central-1", "dcd47hmlyh4gj"],
  ["eu-central-1", "d1yskz112fp8al"],
  ["eu-central-1", "d9k6b4sx9c48v"],
  ["eu-central-1", "d3rlqvm3iu72rs"],
  ["eu-central-1", "duho5b1nom8zz"],
  ["eu-central-1", "dtfnz9y0ixjn8"],
  ["eu-central-1", "d2doumqtomuh0s"],
  ["eu-central-1", "d2cr19zn12zcr2"],
  ["eu-north-1", "d37hl959efrtzb"],
  ["eu-north-1", "di66xcdq5nl9r"],
  ["eu-north-1", "d3sblqo0h6oz38"],
  ["eu-north-1", "d3vo7qfd6fd600"],
  ["eu-west-1", "d1e4r4hrmbn529"],
  ["eu-west-1", "dmivh855q7yt0"],
  ["eu-west-1", "d3cry3od3qbxkj"],
  ["eu-west-1", "d2x2ck5ps28xyt"],
  ["eu-west-1", "d1my2kkst34a3y"],
  ["eu-west-1", "dciahah8eydwa"],
  ["eu-west-1", "d3i4dkh9in4wov"],
  ["eu-west-1", "d3iubtklevzys4"],
  ["eu-west-2", "dvr59tlqtg3sr"],
  ["eu-west-2", "dhj2c2j30id5q"],
  ["eu-west-3", "dj47a0a6736m5"],
  ["eu-west-3", "d29hnlhew11w7v"],
  ["eu-west-3", "d38sm40i1gg9im"],
  ["eu-west-3", "djoqzj9gdu25h"],
  ["us-east-1", "d10hksl83hnlja"],
  ["us-east-1", "dtvul2oqzky9n"],
  ["us-east-1", "d312ogufdb3jyd"],
  ["us-east-1", "d1wgo1raawbpoi"],
  ["us-east-1", "d3hry6987el80b"],
  ["us-east-1", "d3lekrwuw09z9d"],
  ["us-east-1", "d240dq204nv1d9"],
  ["us-east-1", "d284j259a1ttv2"],
  ["us-east-1", "d2lmvz6q67vwff"],
  ["us-east-1", "d2dtj0lpcjer8z"],
  ["us-east-1", "d19vj0hvdv23l3"],
  ["us-east-1", "d20x23v4jt3w2x"],
  ["us-east-1", "d38hj40ry6h9ej"],
  ["us-east-1", "d13n20ennras0k"],
  ["us-east-1", "d1g9ha52lqt2mn"],
  ["us-east-1", "d2muovncix9559"],
  ["us-east-1", "dma7zc1osz91a"],
  ["us-east-1", "d1pbijc0v1vgq3"],
  ["us-east-1", "d1oa16cd3kdi6f"],
  ["us-east-1", "d3565lcb3ojl1f"],
  ["us-east-1", "ddby0awytxw2p"],
  ["us-east-1", "d3vcta5q2xi2vj"],
  ["us-east-1", "d1yeasnhixqiui"],
  ["us-east-1", "d1ldpv0104xmkw"],
  ["us-east-1", "dl551kgts2plw"],
  ["us-east-1", "ds4uosxuiak0n"],
  ["us-east-1", "d2vsgj37b4066f"],
  ["us-east-1", "d3i6sh9p2da2yx"],
  ["us-east-1", "d318cufupsmfh1"],
  ["us-east-1", "d2urg6s5w623ju"],
  ["us-east-1", "d29zws81js6mo9"],
  ["us-east-1", "d2vtpunt5d8lh2"],
  ["us-east-1", "dwzhh7vcrg5gj"],
  ["us-east-1", "d2rrngdi2pc67n"],
  ["us-east-1", "d2f5lf6z8d4z4n"],
  ["us-east-1", "dtscvfkatp63n"],
  ["us-east-1", "d3rbmbpnzvp7bk"],
  ["us-east-1", "d5pnifocnm0kh"],
  ["us-east-1", "d32gicz5kmm4oi"],
  ["us-east-1", "d2tjqdqf4jci9p"],
  ["us-east-1", "d6jgcy0jria89"],
  ["us-east-1", "d21liz2kg7tene"],
  ["us-east-1", "d12g1xd8tgtwpt"],
  ["us-east-1", "d398g6dz3opfv0"],
  ["us-east-1", "d1srwp5uuziyt9"],
  ["us-east-1", "d2i87w56wou7qj"],
  ["us-east-2", "dod9dep2wldhp"],
  ["us-east-2", "d3ttgh54twvjlm"],
  ["us-east-2", "d3b0hwg64oxpr5"],
  ["us-east-2", "d38nl2e2iyazfs"],
  ["us-east-2", "d1p77krmqs83on"],
  ["us-east-2", "d1w0hqn4i1lehy"],
  ["us-east-2", "d3ohqsgcdazoju"],
  ["us-east-2", "d1ulkuxhdkwjsv"],
  ["us-east-2", "d1jlv5aachqodl"],
  ["us-east-2", "d35opphu4vu6x3"],
  ["us-east-2", "d1vewu8mmrg87f"],
  ["us-east-2", "d109phqjvu48kx"],
  ["us-west-1", "d210ev7vxi8mpy"],
  ["us-west-1", "dompuy0s7ug1v"],
  ["us-west-1", "d3lpp6ern77zw4"],
  ["us-west-2", "d30ba77762teie"],
  ["us-west-2", "d24hhadt2epd6d"],
  ["us-west-2", "d2ao1kmie2cnuc"],
  ["us-west-2", "da2hrrx9arouh"],
];

const main = async () => {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
Migrates the given app to use HostingGateway instead of Lambda@Edge functions for featurs like Basic Auth, Custom Rules and headers.
This is meant to be used one-off migration of developer apps/integration test apps. Customer applications may use a more automated mechanism in the future.

Usage:
ts-node hostingGatewayMassMigrator.ts --stage=test --dryRun
`
    )
    .option("stage", {
      describe: "test, beta, gamma or prod",
      type: "string",
      demandOption: true,
      default: "test",
      choices: ["test", "beta", "gamma", "prod"],
    })
    .option("dryRun", {
      describe: "run the commmand as readOnly",
      type: "boolean",
    })
    .strict()
    .version(false)
    .help().argv;

  let { stage, dryRun } = args;

  const accounts = await controlPlaneAccounts({
    stage: stage as Stage,
  });
  await preflightCAZ({ accounts, role: "OncallOperator" });

  for (let [region, appId] of appsToMigrate) {
    await migrateApp(stage, region, appId, "saazim", dryRun!!);
  }
};

async function migrateApp(
  stage: string,
  region: string,
  appId: string,
  alias: string,
  dryRun: boolean
) {
  let controlplaneCredentials: Provider<AwsCredentialIdentity> | undefined;
  let dataplaneCredentials: Provider<AwsCredentialIdentity> | undefined;

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

  const warmResourcesDAO = new WarmResourcesDAO(
    stage,
    region,
    controlplaneCredentials
  );

  const hostingGatewayURL =
    stage === "test"
      ? await getCloudFormationOutput(
          cfnClient,
          `HostingGateway-${alias}`,
          "HostingGatewayURL"
        )
      : `https://${appId}.${getDomainName(stage, region)}`;

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
    let distributionConfig: DistributionConfig | undefined;
    let eTag: string | undefined;
    try {
      const fetchedDist = await fetchDistribution(cfClient, distId);

      distributionConfig = fetchedDist.distributionConfig;
      eTag = fetchedDist.eTag;
    } catch (e) {
      if (e instanceof NoSuchDistribution) {
        console.warn("Distribution does not exist. Skipping");
        continue;
      }
      throw e;
    }

    if (!eTag || !distributionConfig) {
      throw new Error("Invalid state");
    }

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

    if (dryRun) {
      console.log("[DryRun=true] Skipped Update Distribution");
    } else {
      const res = await cfClient.updateDistribution({
        Id: distId,
        IfMatch: eTag,
        DistributionConfig: distributionConfig,
      });
      console.info("Updated the distribution", res);
      await sleep(2000);
    }
  }

  if (dryRun) {
    console.log("[DryRun=true] Skipped updateResourceDistType");
  } else {
    const res = await warmResourcesDAO.updateResourceDistType(appId, "GATEWAY");
    console.log("Updated resourceDistType", res);
  }
}

function getDdbClient(
  region: string,
  credentials?: Provider<AwsCredentialIdentity>
) {
  const dynamodbClient = new DynamoDBClient({ region, credentials });
  return DynamoDBDocumentClient.from(dynamodbClient);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
