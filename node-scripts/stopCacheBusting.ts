import yargs from "yargs";
import { CloudWatch, InsightRuleContributor } from "@aws-sdk/client-cloudwatch";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  kinesisConsumerAccount,
  Region,
  Stage,
} from "./Isengard";
import { toAirportCode, toRegionName } from "./utils/regions";
import { AirportCode, RegionName } from "./Isengard/types";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { CloudFront } from "@aws-sdk/client-cloudfront";
import {
  CloudWatchLogs,
  GetQueryResultsCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";
import { capitalize } from "./Isengard/createAccount/createAmplifyAccount";
import sleep from "./utils/sleep";

const { hideBin } = require("yargs/helpers");

const DRYRUN_DOMAIN = "d36u6xuby93zq0";
const ATTACK_THRESHOLD = 1000000;

async function getArgs() {
  return (await yargs(hideBin(process.argv))
    .usage("Mitigate a potential cache-busting attack on an Amplify app.")
    .option("region", {
      describe: `Region to perform the mitigation (e.g. "pdx", "PDX", "us-west-2").`,
      type: "string",
    })
    .option("stage", {
      describe:
        'Stage to perform the mitigation. Defaults to "prod", should only ever be "prod" unless testing the script.',
      type: "string",
      default: "prod",
    })
    .option("dryrun", {
      describe: `A dry run will test both the detection phase with CloudWatch AND the mitigation phase by changing a
dummy CloudFront distribution in beta-PDX, regardless of whether a cache-busting attack is taking place.`,
      type: "boolean",
      default: false,
    })
    .option("contributors", {
      describe:
        "Number of highest-traffic Amplify apps to inspect for cache-busting attacks (defaults to 3).",
      type: "number",
      default: 3,
    })
    .option("minutes", {
      describe:
        "Number of minutes before now to test for cache-busting attacks (defaults to 30).",
      type: "number",
      default: 30,
    })
    .option("distribution", {
      describe: `Override the attack detection phase and immediately perform mitigation on a CloudFront distribution (e.g. "d165wb2oa9rktm" or "E3PJ2DYKW5YZVG").`,
      type: "string",
    })
    .demandOption(["region"])
    .strict()
    .version(false)
    .help().argv) as {
    region: Region;
    stage: Stage;
    dryrun: boolean;
    contributors: number;
    minutes: number;
    distribution: string;
  };
}

async function getClients(stage: Stage, airportCode: AirportCode, regionName: RegionName, dryrun: boolean) {
  console.log("Getting Isengard accounts and SDK clients...");

  // Trailing underscore prevents namespace collision between the const and the function
  const kinesisConsumerAccount_ = await kinesisConsumerAccount(
    stage,
    airportCode
  );

  // CloudWatch clients for querying Contributor Insights (i.e. Alpine rules) and Log Insights to detect attacks
  const cloudWatchConfig = {
    region: regionName as string,
    credentials: getIsengardCredentialsProvider(
      kinesisConsumerAccount_.accountId
    ),
  };
  const cloudWatch = new CloudWatch(cloudWatchConfig);
  const cloudWatchLogs = new CloudWatchLogs(cloudWatchConfig);

  // For dry runs, use a dummy CloudFront distribution in beta-PDX
  let controlPlaneAccount_;
  if (dryrun) {
    controlPlaneAccount_ = await controlPlaneAccount("beta", "PDX");
    regionName = "us-west-2";
  } else {
    controlPlaneAccount_ = await controlPlaneAccount(stage, airportCode);
  }

  // DynamoDB client for mapping CloudFront domain ID's to distribution ID's
  const dynamoDb = new DynamoDB({
    region: regionName,
    credentials: getIsengardCredentialsProvider(controlPlaneAccount_.accountId),
  });

  // CloudFront client for removing query parameter from cache key
  const cloudFront = new CloudFront({
    region: regionName,
    credentials: getIsengardCredentialsProvider(
      controlPlaneAccount_.accountId,
      "OncallOperator"
    ),
  });

  console.log("==========");
  return { cloudWatch, cloudWatchLogs, dynamoDb, cloudFront };
}

async function getTopTalkers(
  cloudwatch: CloudWatch,
  contributors: number,
  minutes: number
) {
  console.log(
    `Searching for the ${contributors} highest-traffic Amplify apps in the last ${minutes} minutes...`
  );
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - minutes * 60 * 1000);

  const insightRuleReport = await cloudwatch.getInsightRuleReport({
    RuleName: "HostingTopTalkersByAccountDistribution",
    MaxContributorCount: contributors,
    Period: 60,
    StartTime: startTime,
    EndTime: endTime,
  });

  // Extract necessary information from Alpine report
  const transformContributor = (contributor: InsightRuleContributor) => {
    if (!contributor.Keys) {
      throw new Error("Error when gathering top talkers.");
    }
    const accountId = contributor.Keys[0];
    const domain = contributor.Keys[1];
    const domainId = domain.split(".")[0];
    const requests = contributor.ApproximateAggregateValue ?? 0;
    console.log(
      `App with CloudFront domain ${domainId} received ${requests} requests (Account ID: ${accountId})`
    );
    return {
      accountId: accountId,
      domainId: domainId,
      requests: requests,
    };
  };

  const topTalkers = insightRuleReport.Contributors?.map(transformContributor);
  if (!topTalkers) {
    throw new Error("No top talkers found.");
  }
  console.log("==========");
  return topTalkers;
}

type LogsInterval = {
  minutes?: number;
  endTime?: number;
  startTime?: number;
};

async function isCacheBusting(
  cloudWatchLogs: CloudWatchLogs,
  stage: Stage,
  domainId: string,
  logsInterval: LogsInterval
) {
  // Presence of minutes overrides end and start times
  let endTime, startTime;
  if (logsInterval.minutes) {
    endTime = new Date().getTime() / 1000;
    startTime = endTime - logsInterval.minutes * 60;
  } else {
    endTime = logsInterval.endTime;
    startTime = logsInterval.startTime;
  }

  console.log(
    "Querying CloudWatch Log Insights to detect cache-busting patterns..."
  );
  // Taken from https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/Build/CacheBustingAttack#H2.Checkthedistributionofqueryparametersbeingtargetedforagivenhostheader28e.gd3k6og6dyjw5ff29
  const queryString = `fields @timestamp, \`c-country\`,\`c-ip\`,\`c-ip-version\`,\`c-port\`,\`cache-behavior-path-pattern\`,\`cs-accept\`,\`cs-accept-encoding\`,\`cs-bytes\`,
\`cs-cookie\`,\`cs-header-names\`,\`cs-headers\`,\`cs-headers-count\`,\`cs-host\`,\`cs-method\`,\`cs-protocol\`,\`cs-protocol-version\`,\`cs-referer\`,\`cs-uri-query\`,
\`cs-uri-stem\`,\`cs-user-agent\`,\`fle-encrypted-fields\`,\`fle-status\`,\`sc-bytes\`,\`sc-content-len\`,\`sc-content-type\`,\`sc-range-end\`,\`sc-range-start\`,\`sc-status\`,
\`ssl-cipher\`,\`ssl-protocol\`,\`time-taken\`,\`time-to-first-byte\`,\`timestamp\`,\`x-edge-detailed-result-type\`,\`x-edge-location\`,\`x-edge-request-id\`,\`x-edge-response-result-type\`,
\`x-edge-result-type\`,\`x-forwarded-for\`,\`x-host-header\`,
@message
| filter ispresent(\`x-host-header\`) and \`x-host-header\` like /${domainId}/
| stats count_distinct(\`cs-uri-stem\`)`;

  const response = await cloudWatchLogs.startQuery({
    startTime: startTime,
    endTime: endTime,
    queryString: queryString,
    logGroupName: `/aws/fargate/AmplifyHostingKinesisConsumer-${capitalize(
      stage
    )}/application.log`,
  });
  if (!response.queryId) {
    throw new Error("QueryId missing, something went wrong.");
  }

  let queryResults: GetQueryResultsCommandOutput;
  let distinctUris = 0;
  // During cache-busting attacks, the number of logs causes the CloudWatch Log Insights query to take a very long time.
  // We cut off the query after a certain amount of time and use the incomplete data.
  for (let i = 0; i < 120; i++) {
    queryResults = await cloudWatchLogs.getQueryResults({
      queryId: response.queryId,
    });
    if (queryResults.results?.length) {
      distinctUris = parseInt(queryResults.results[0][0].value ?? "0");
    }

    // End the Log Insights Query if it's complete, or if the attack threshold has been reached.
    if (distinctUris > ATTACK_THRESHOLD) {
      break;
    }
    if (
      !(
        queryResults.status === "Running" || queryResults.status === "Scheduled"
      )
    ) {
      break;
    }
    await sleep(500);
  }
  console.log(
    `Distinct URI's: ${distinctUris} (The higher this number is, the more likely a cache-busting attack is in progress.)`
  );

  let isAttack = false;
  if (distinctUris > ATTACK_THRESHOLD) {
    console.log(
      `A cache-busting attack is taking place on the CloudFront distribution ${domainId}!`
    );
    isAttack = true;
  } else {
    console.log(`No cache-busting attack detected on CloudFront distribution ${domainId}. If you believe this is incorrect, please
re-run the script with the option "--distribution ${domainId}".`);
  }
  console.log("==========");
  return isAttack;
}

async function domainToApp(
  dynamoDb: DynamoDB,
  domainTable: string,
  domainId: string,
  stage: Stage
) {
  // Map a domain ID to an Amplify app ID
  let queryInput = {
    TableName: domainTable,
    IndexName: "domainId-index",
    ExpressionAttributeValues: {
      ":domainId": {
        S: domainId,
      },
    },
    KeyConditionExpression: `domainId = :domainId`,
    ProjectionExpression: "appId",
  };
  const items = (await dynamoDb.query(queryInput)).Items;
  let appId = "";
  if (!items || items.length == 0) {
    // If DynamoDB didn't return any items, assume that the provided domain ID is associated with the app distribution,
    // and thus is also the app ID.
    appId = domainId;
  } else if (items.length == 1 && items[0].appId.S) {
    // If DynamoDB returned a single item, assume that the provided domain ID is associated with a domain distribution
    // for an app, and get the app ID.
    appId = items[0].appId.S;
  } else {
    throw new Error(
      `The provided domain ID ${domainId} should not be associated with more than one app.`
    );
  }
  console.log(
    `Domain ${domainId} belongs to Amplify app ${appId}
Genie: https://genie.console.amplify.aws.a2z.com/${stage}/app/${appId}

This app is associated with the following CloudFront distributions:`
  );
  return appId;
}

async function appToAppDistro(
  dynamoDb: DynamoDB,
  appTable: string,
  appId: string
) {
  // Map an app ID to the app's app distribution ID
  const queryInput = {
    TableName: appTable,
    ExpressionAttributeValues: {
      ":appId": {
        S: appId,
      },
    },
    KeyConditionExpression: `appId = :appId`,
    ProjectionExpression: "cloudFrontDistributionId",
  };
  const items = (await dynamoDb.query(queryInput)).Items;

  if (items?.length == 1 && items[0].cloudFrontDistributionId.S) {
    return items[0].cloudFrontDistributionId.S;
  } else {
    throw new Error(`No app distribution ID found for app ${appId}.`);
  }
}

async function appToDomainDistros(
  dynamoDb: DynamoDB,
  domainTable: string,
  appId: string
) {
  // Map an app ID to the distribution ID's of the app's custom domains
  const queryInput = {
    TableName: domainTable,
    ExpressionAttributeValues: {
      ":appId": {
        S: appId,
      },
    },
    KeyConditionExpression: `appId = :appId`,
    ProjectionExpression: "distributionId",
  };
  const items = (await dynamoDb.query(queryInput)).Items;
  let domainDistros: string[] = [];
  if (items) {
    domainDistros = items
      .filter((item) => item.distributionId.S)
      .map((item) => item.distributionId.S!);
  }
  return domainDistros;
}

async function getDistributionIds(
  dynamoDb: DynamoDB,
  domainId: string,
  stage: Stage,
  regionName: RegionName
) {
  const domainTable = `${stage}-${regionName}-Domain`;
  const appTable = `${stage}-${regionName}-App`;

  // 1. Map the domain ID to an app ID
  let appId = await domainToApp(dynamoDb, domainTable, domainId, stage);

  // 2. Map the app ID to the app distribution's ID
  let distributionIds = [await appToAppDistro(dynamoDb, appTable, appId)];

  // 3. Map the app ID to domain distribution IDs
  distributionIds.push(
    ...(await appToDomainDistros(dynamoDb, domainTable, appId))
  );

  for (const distributionId of distributionIds) {
    console.log(
      `Distribution ${distributionId}
Edge Tools: https://edge-tools.amazon.com/distributions/${distributionId}`
    );
  }

  console.log("==========");
  return distributionIds;
}

async function changeCachePolicy(
  cloudFront: CloudFront,
  distributionId: string
) {
  const distribution = await cloudFront.getDistribution({ Id: distributionId });

  // Setting QueryString to false is equivalent to setting "Query strings" to "None" in the CloudFront console
  let distributionConfig = distribution.Distribution?.DistributionConfig;
  if (distributionConfig) {
    try {
      distributionConfig.DefaultCacheBehavior!.ForwardedValues!.QueryString =
        false;
    } catch {
      throw new Error("DistributionConfig is missing attributes.");
    }
  }

  await cloudFront.updateDistribution({
    Id: distributionId,
    DistributionConfig: distributionConfig,
    IfMatch: distribution.ETag ?? distributionId,
  });
  console.log(
    `Query strings are now removed from the cache keys of distribution ${distributionId}.
Please check the associated Amplify in Genie. If it's an SSR app or has a reverse proxy, notify the customer that their
app will no longer work, and plan to re-enable query strings once the attack has passed.`
  );
  console.log("==========");
}

async function main() {
  const { region, stage, dryrun, contributors, minutes, distribution } =
    await getArgs();
  const regionName = toRegionName(region);
  const airportCode = toAirportCode(region);

  if (dryrun) {
    console.warn(
      `You have selected the "dry run" option, intended for testing whether this script works in your environment. It will
make the usual CloudWatch queries to detect whether a cache busting attack is taking place in the selected stage and
region (${stage}-${airportCode}), but it will always test the mitigation on a CloudFront distribution (${DRYRUN_DOMAIN})
in beta-PDX.`
    );
    console.log("==========");
  }

  console.log(
    `Mitigating potential cache-busting attack in ${stage}-${airportCode}...`
  );
  console.log("==========");

  const { cloudWatch, cloudWatchLogs, dynamoDb, cloudFront } = await getClients(
    stage,
    airportCode,
    regionName,
    dryrun
  );

  if (distribution) {
    console.warn(
      `You have selected the "distribution" option, which will bypass checks and immediately perform the mitigation
on the CloudFront distribution ${distribution}.`
    );
    let distributionIds = await getDistributionIds(
      dynamoDb,
      distribution,
      stage,
      regionName
    );
    for (const distributionId of distributionIds) {
      await changeCachePolicy(cloudFront, distributionId);
    }
    return;
  }

  const topTalkers =
    (await getTopTalkers(cloudWatch, contributors, minutes)) ?? [];

  for (const talker of topTalkers) {
    if (
      await isCacheBusting(cloudWatchLogs, stage, talker.domainId, { minutes })
    ) {
      const distributionIds = await getDistributionIds(
        dynamoDb,
        talker.domainId,
        stage,
        regionName
      );
      for (const distributionId of distributionIds) {
        await changeCachePolicy(cloudFront, distributionId);
      }
    }
  }

  if (dryrun) {
    console.log("Performing dry run mitigation...");
    const distributionIds = await getDistributionIds(
      dynamoDb,
      DRYRUN_DOMAIN,
      "beta",
      "us-west-2"
    );
    for (const distributionId of distributionIds) {
      await changeCachePolicy(cloudFront, distributionId);
    }
  }
  // Used for testing on this past attack: https://t.corp.amazon.com/V684712782/communication
  // console.log(await isCacheBusting(cloudWatchLogs, stage, "d165wb2oa9rktm", {
  //   endTime: new Date("2022-08-19T16:30:00").getTime() / 1000,
  //   startTime: new Date("2022-08-19T15:30:00").getTime() / 1000
  // }))
}

main().then()
  .catch(e => console.warn(e));
