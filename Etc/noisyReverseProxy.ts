import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import commandLineArgs from "command-line-args";
import readline from "readline";
import { URL } from "url";
import {
  CacheBehavior,
  CloudFront,
  DistributionConfig,
  Origin,
} from "@aws-sdk/client-cloudfront";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

/*
======================
 Configurable proxy params
======================
*/
const MIN_TTL = 0;
const DEFAULT_TTL = 2;
const MAX_TTL = 600;
const CACHED_METHODS = ["GET", "HEAD", "OPTIONS"];
const ORIGIN_SSL_PROTOCOLS = ["TLSv1.2"];
const ORIGIN_READ_TIMEOUT_SECONDS = 30;
const ORIGIN_KEEP_ALIVE_SECONDS = 60;
const ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "POST",
  "PATCH",
  "DELETE",
];
const FORWARDED_HEADERS = [
  "Authorization",
  "CloudFront-Viewer-Country",
  "Host",
  "CloudFront-Is-Desktop-Viewer",
  "CloudFront-Is-Mobile-Viewer",
  "CloudFront-Is-SmartTV-Viewer",
  "CloudFront-Is-Tablet-Viewer",
];

// The prefix to use when naming the new origins in cloudfront
const REVERSE_PROXY_PREFIX = "ReverseProxy";
const EDGE_TOOLS_URL = "https://edge-tools.amazon.com/distributions";
const RED_COLOR = "\x1b[31m";

interface ReverseProxy {
  id: string;
  source: string;
  target: string;
}

interface RedirectRule {
  source: string;
  target: string;
  status: string;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Main entry point when the script runs.
 * runs `migrate` or `rollback` commands depending
 * on the specified --command argument.
 */
async function main() {
  try {
    const params = commandLineArgs([
      { name: "appId", type: String },
      { name: "region", type: String },
      { name: "stage", type: String, defaultValue: "test" },
      { name: "distributionId", type: String, multiple: true },
      { name: "command", type: String, defaultValue: "migrate" },
      { name: "dryrun", type: Boolean, defaultValue: false },
    ]);

    if (params.command === "migrate") {
      await migrate(
        params.appId,
        params.region,
        params.stage,
        params.dryrun,
        params.distributionId
      );
    }

    if (params.command === "rollback") {
      await rollback(
        params.appId,
        params.region,
        params.stage,
        params.dryrun,
        params.distributionId
      );
    }

    console.log("================");
    console.log("DONE");
    console.log("================");
  } catch (err) {
    console.error(RED_COLOR, err);
  } finally {
    rl.close();
  }
}

/**
 * This is the main command that runs and reads reverse
 * proxies from the provided appId and moves them to the
 * distribution as origins.
 *
 * @param appId AppId, necessary to read redirect rules from LambdaEdgeConfig
 * @param region Region where the app is hosted (i.e. us-east-1)
 * @param stage beta, gamma, prod or test for localstacks
 * @param specificDistributionIds List of distributions where to apply the reverse proxies,
 * if not provided, it will be applied to all distributions associated to the app
 */
async function migrate(
  appId: string,
  region: string,
  stage: string,
  dryRun: boolean,
  specificDistributionIds?: string[]
) {
  const cloudfront = new CloudFront({ region });
  const ddb = new DynamoDBClient({ region });
  const dynamodb = DynamoDBDocumentClient.from(ddb);

  const redirectRules = await fetchRedirectRulesForApp(dynamodb, appId);
  const reverseProxies = getReverseProxiesFromRedirectRules(redirectRules);
  const distributions = await getDistributionsToUpdate(
    dynamodb,
    stage,
    region,
    appId,
    specificDistributionIds
  );

  for (const distributionId of distributions) {
    const distribution = await fetchDistribution(cloudfront, distributionId);
    const distributionConfig = distribution.distributionConfig;
    const defaultCacheBehavior = distributionConfig.DefaultCacheBehavior;
    const eTag = distribution.eTag;

    const updatedOrigins: Origin[] = [];
    const updatedCacheBehaviors: CacheBehavior[] = [];

    // Preserve existing origins
    const existingOrigins = getOriginsToPreserve(distributionConfig);
    updatedOrigins.push(...existingOrigins);

    // Get the OriginShieldRegion from the existing s3 origin
    const s3Origin = getS3Origin(distributionConfig);
    const originShieldRegion = s3Origin.OriginShield?.OriginShieldRegion;

    // Get the RealtimeLogConfigArn (kinesis stream) from the default behavior
    const realTimeLogConfigArn = defaultCacheBehavior?.RealtimeLogConfigArn;

    // Build new origins based on the reverse proxies.
    const newOrigins = buildOriginsFromReverseProxies(
      reverseProxies,
      originShieldRegion
    );

    // Build new cache behaviors based on the reverse proxies.
    const newCacheBehaviors = buildCacheBehaviorsFromReverseProxies(
      reverseProxies,
      realTimeLogConfigArn
    );

    updatedOrigins.push(...newOrigins);
    updatedCacheBehaviors.push(...newCacheBehaviors);

    if (dryRun) {
      console.log("Running on dry-run mode, skipping update");
      continue;
    }

    const proceed = await confirm(`Do you want to update ${distributionId}`);
    if (!proceed) {
      console.log("Skipping update");
      continue;
    }

    console.log("Updating distribution...");
    await updateDistribution(
      cloudfront,
      distributionConfig,
      distributionId,
      eTag,
      updatedOrigins,
      updatedCacheBehaviors
    );

    console.log("Distribution updated successfully");
    console.log(`${EDGE_TOOLS_URL}/${distributionId}`);
  }
}

/**
 * Rollback command will remove the reverse proxies from
 * the distribution(s) and leave them in their original
 * state.
 *
 * @param appId
 * @param region
 * @param stage
 * @param dryRun
 * @param specificDistributionIds
 */
async function rollback(
  appId: string,
  region: string,
  stage: string,
  dryRun: boolean,
  specificDistributionIds: string[]
) {
  const cloudfront = new CloudFront({ region });
  const ddb = new DynamoDBClient({ region });
  const dynamodb = DynamoDBDocumentClient.from(ddb);

  const distributions = await getDistributionsToUpdate(
    dynamodb,
    stage,
    region,
    appId,
    specificDistributionIds
  );

  for (const distributionId of distributions) {
    const distribution = await fetchDistribution(cloudfront, distributionId);
    const distributionConfig = distribution.distributionConfig;
    const eTag = distribution.eTag;

    // Preserve existing origins, except for reverse proxies
    const existingOrigins = getOriginsToPreserve(distributionConfig);
    // Cleanup cache behaviors, only leave the default one
    const cacheBehaviors: CacheBehavior[] = [];

    if (dryRun) {
      console.log("Running on dry-run mode, skipping rollback");
      continue;
    }

    const proceed = await confirm(`Do you want to update ${distributionId}`);
    if (!proceed) {
      console.log("Skipping update");
      continue;
    }

    console.log("Updating distribution...");
    await updateDistribution(
      cloudfront,
      distributionConfig,
      distributionId,
      eTag,
      existingOrigins,
      cacheBehaviors
    );

    console.log("Distribution updated successfully");
    console.log(`${EDGE_TOOLS_URL}/${distributionId}`);
  }
}

/**
 * Utility functions
 */

async function getDistributionsToUpdate(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  specificDistributionIds?: string[]
): Promise<string[]> {
  // If the user input contains specific distribution ids,
  // we honor those instead of fetching the app distributions
  const distros =
    specificDistributionIds && specificDistributionIds.length > 0
      ? specificDistributionIds
      : await getDistributionsForApp(dynamodb, stage, region, appId);

  console.log("Distributions to update:", distros);
  return distros;
}

function buildCacheBehaviorsFromReverseProxies(
  reverseProxies: ReverseProxy[],
  realTimeLogConfigArn?: string
): CacheBehavior[] {
  const newCacheBehaviors: CacheBehavior[] = [];
  reverseProxies.map((proxy) => {
    const source = proxy.source;
    const cacheBehavior = buildCacheBehavior(
      proxy.id,
      source,
      realTimeLogConfigArn
    );

    const path = cacheBehavior.PathPattern;
    console.log("Adding new cache behavior on path", path);
    newCacheBehaviors.push(cacheBehavior);
  });
  return newCacheBehaviors;
}

function buildOriginsFromReverseProxies(
  reverseProxies: ReverseProxy[],
  originShieldRegion?: string
): Origin[] {
  const newOrigins: Origin[] = [];
  reverseProxies.forEach((proxy) => {
    const target = new URL(proxy.target);
    const origin = buildOrigin(proxy.id, target, originShieldRegion);
    console.log("Adding new origin", origin.DomainName);
    newOrigins.push(origin);
  });
  return newOrigins;
}

async function fetchDistribution(
  cloudfront: CloudFront,
  distributionId: string
): Promise<{
  eTag: string;
  distributionConfig: DistributionConfig;
}> {
  console.log("================");
  console.log("Fetching distribution", distributionId);
  const response = await cloudfront.getDistribution({
    Id: distributionId,
  });

  if (!response.Distribution || !response.ETag) {
    throw new Error(`"Distribution ${distributionId} not found"`);
  }

  if (!response.Distribution.DistributionConfig) {
    throw new Error(`"Distribution ${distributionId} not found"`);
  }

  return {
    eTag: response.ETag,
    distributionConfig: response.Distribution.DistributionConfig,
  };
}

function getReverseProxiesFromRedirectRules(redirectRules: RedirectRule[]) {
  const reverseProxies: ReverseProxy[] = [];
  redirectRules.forEach((rule) => {
    console.log("================");
    console.log(`Checking if rule ${rule.source} is a reverse proxy`);
    if (isReverseProxy(rule.source, rule.target, rule.status)) {
      console.log(`Yes it is. Target = ${rule.target}`);

      if (isRewriteProxy(rule.source, rule.target)) {
        console.log("It is a rewrite proxy, cannot be migrated");
        return;
      }

      // Clean the source
      const source = replaceWildcards(rule.source);
      reverseProxies.push({
        id: generateReverseProxyId(),
        target: rule.target,
        source,
      });
    }
  });

  if (reverseProxies.length === 0) {
    throw new Error("No reverse proxies found");
  }

  console.log("================");
  return reverseProxies;
}

function getOriginsToPreserve(
  distributionConfig: DistributionConfig
): Origin[] {
  const origins = distributionConfig.Origins;
  const existingOrigins: Origin[] = [];

  // Preserve existing origins except for reverse proxies,
  // we want to always replace those based on the app redirect rules.
  origins?.Items?.forEach((origin) => {
    if (!isReverseProxyOrigin(origin)) {
      console.log(`Will preserve origin ${origin.DomainName}`);
      existingOrigins.push(origin);
    }
  });

  return existingOrigins;
}

function getS3Origin(distributionConfig: DistributionConfig): Origin {
  const origins = distributionConfig.Origins;

  // Find the s3 origin from the existing domains
  const s3Origin = origins?.Items?.find(
    (origin) => origin.S3OriginConfig && !origin.CustomOriginConfig
  );

  // There should always be at least 1 origin, the default one
  // pointing to the S3 bucket, if not, there is something wrong.
  if (!s3Origin) {
    throw new Error(
      `There is something wrong, the S3 default origin ` +
        `was not found on the distribution`
    );
  }

  return s3Origin;
}

async function fetchRedirectRulesForApp(
  dynamodb: DynamoDBDocumentClient,
  appId: string
): Promise<
  Array<{
    source: string;
    target: string;
    status: string;
  }>
> {
  console.log("Fetching redirect rules for appId", appId);
  const data = await dynamodb.send(
    new GetCommand({
      TableName: "LambdaEdgeConfig",
      Key: {
        appId,
      },
    })
  );

  if (!data.Item) {
    throw new Error(`AppId ${appId} not found in LambdaEdgeConfig table`);
  }

  if (!data.Item.customRuleConfigs) {
    throw new Error(`No redirect rules found for appId ${appId}`);
  }

  return data.Item.customRuleConfigs;
}

function isRewriteProxy(source: string, target: string): boolean {
  const targetUrl = new URL(target);
  const targetPath = decodeURI(targetUrl.pathname);
  // If the source is different than the target, then a rewrite
  // is necessary. For example source = /api/* and target = /Prod
  return removeTrailingSlash(source) !== removeTrailingSlash(targetPath);
}

function generateReverseProxyId(): string {
  return `${REVERSE_PROXY_PREFIX}${Date.now().toString()}`;
}

function isReverseProxy(
  source: string,
  target: string,
  status: string
): boolean {
  // If the target starts with http:// or https://
  // and the source is not a URL (should be a path)
  // and the status is 200 (Rewrite)
  // and the redirect rule is not an SSR redirect

  let isSSRRule = false;
  const isTargetCloudFront = new RegExp(/.*\.cloudfront\.net/);
  if (isTargetCloudFront.test(target) && source === "/<*>") {
    isSSRRule = true;
  }

  const isUrl = new RegExp(/^http:\/\/|^https:\/\//);
  const isPath = new RegExp(/^\//);

  return (
    isPath.test(source) &&
    isUrl.test(target) &&
    status === "200" &&
    !isSSRRule
  );
}

function replaceWildcards(url: string): string {
  if (!url) return "";
  const regex = new RegExp(/<\*>/);
  return url.replace(regex, "*");
}

function removeTrailingSlash(path: string): string {
  if (!path) return "";
  const regex = new RegExp(/\/$/);
  return regex.test(path) ? path.replace(regex, "") : path;
}

async function confirm(prompt: string) {
  return new Promise<boolean>((resolve, reject) => {
    rl.question(`${prompt} [y/N]: `, (answer: string) => {
      if (answer === "y") resolve(true);
      else resolve(false);
    });
  });
}

function isReverseProxyOrigin(origin: Origin): boolean {
  // Check whether a cloudfront origin is a reverse proxy or not
  if (!origin.Id) return false;
  return (
    origin.Id.startsWith(REVERSE_PROXY_PREFIX) &&
    origin.CustomOriginConfig !== undefined
  );
}

function buildOrigin(
  id: string,
  target: URL,
  originShieldRegion?: string
): Origin {
  return {
    Id: id,
    DomainName: target.hostname,
    CustomOriginConfig: {
      HTTPPort: 80,
      HTTPSPort: 443,
      OriginProtocolPolicy:
        target.protocol === "https:" ? "https-only" : "http-only",
      OriginReadTimeout: ORIGIN_READ_TIMEOUT_SECONDS,
      OriginKeepaliveTimeout: ORIGIN_KEEP_ALIVE_SECONDS,
      OriginSslProtocols: {
        Items: ORIGIN_SSL_PROTOCOLS,
        Quantity: ORIGIN_SSL_PROTOCOLS.length,
      },
    },
    OriginPath: "",
    OriginShield: {
      OriginShieldRegion: originShieldRegion,
      Enabled: originShieldRegion ? true : false,
    },
    CustomHeaders: {
      Items: [],
      Quantity: 0,
    },
  };
}

function buildCacheBehavior(
  originId: string,
  sourcePath: string,
  realTimeLogConfigArn?: string
): CacheBehavior {
  return {
    PathPattern: sourcePath,
    TargetOriginId: originId,
    Compress: true,
    ViewerProtocolPolicy: "redirect-to-https",
    SmoothStreaming: false,
    DefaultTTL: DEFAULT_TTL,
    MinTTL: MIN_TTL,
    MaxTTL: MAX_TTL,
    FieldLevelEncryptionId: "",
    RealtimeLogConfigArn: realTimeLogConfigArn,
    LambdaFunctionAssociations: {
      Quantity: 0,
      Items: [],
    },
    ForwardedValues: {
      QueryStringCacheKeys: {
        Items: [],
        Quantity: 0,
      },
      QueryString: true,
      Cookies: {
        Forward: "all",
      },
      Headers: {
        Items: FORWARDED_HEADERS,
        Quantity: FORWARDED_HEADERS.length,
      },
    },
    AllowedMethods: {
      CachedMethods: {
        Quantity: CACHED_METHODS.length,
        Items: CACHED_METHODS,
      },
      Items: ALLOWED_METHODS,
      Quantity: ALLOWED_METHODS.length,
    },
  };
}

async function getDistributionsForApp(
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string
): Promise<string[]> {
  const distributions = [];
  const appTableName = `${stage}-${region}-App`;
  console.log("Looking for app distributions");
  const app = await dynamodb.send(
    new GetCommand({
      TableName: appTableName,
      Key: {
        appId: appId,
      },
    })
  );

  if (!app.Item) {
    throw new Error(`AppId ${appId} not found in table ${appTableName}`);
  }

  if (app.Item.cloudFrontDistributionId) {
    console.log(
      "Found default distribution",
      app.Item.cloudFrontDistributionId
    );
    distributions.push(app.Item.cloudFrontDistributionId);
  }

  const domainsTableName = `${stage}-${region}-Domain`;
  console.log("Looking for custom domain distributions");
  const domains = await dynamodb.send(
    new QueryCommand({
      TableName: domainsTableName,
      KeyConditionExpression: "appId = :appId",
      ExpressionAttributeValues: {
        ":appId": appId,
      },
    })
  );

  if (domains.Items) {
    if (domains.Items.length === 0) {
      console.log("No custom domains found");
    }

    domains.Items.forEach(({ distributionId, domainName }) => {
      if (distributionId) {
        console.log(`Found domain ${domainName} with distro ${distributionId}`);
        distributions.push(distributionId);
      }
    });
  }

  return distributions;
}

async function updateDistribution(
  cloudfront: CloudFront,
  config: DistributionConfig,
  distributionId: string,
  eTag: string,
  updatedOrigins: Origin[],
  updatedCacheBehaviors: CacheBehavior[]
) {
  await cloudfront.updateDistribution({
    Id: distributionId,
    IfMatch: eTag,
    DistributionConfig: {
      ...config,
      Origins: {
        Items: updatedOrigins,
        Quantity: updatedOrigins.length,
      },
      CacheBehaviors: {
        Items: updatedCacheBehaviors,
        Quantity: updatedCacheBehaviors.length,
      },
    },
  });
}

main();
