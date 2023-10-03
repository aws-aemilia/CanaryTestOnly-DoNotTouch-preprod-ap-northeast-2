import logger from "../Commons/utils/logger";
import { SpinningLogger } from "../Commons/utils/spinningLogger";
import { getIsengardCredentialsProvider } from "../Commons/Isengard";
import { toRegionName } from "../Commons/utils/regions";
import rateLimit from "p-limit";
import confirm from "../Commons/utils/confirm";
import yargs from "yargs";
import {
  S3Client,
  ListObjectsCommand,
  ListBucketsCommand,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import {
  CloudFrontClient,
  ListDistributionsCommand,
  ListDistributionsCommandOutput,
} from "@aws-sdk/client-cloudfront";

const spinner = new SpinningLogger();
const deleteBucketRateLimit = rateLimit(3);
let deletedMB = 0;

async function main() {
  logger.info(
    `
        ||
        ||
        ||    Welcome to S3 Janitor! Let's sweep, let's clear, with not a single
        ||    smear. Unused buckets will disappear, making S3 space cheer!
        ||
        ||
        ||
       /||\\           ____.-.____
      /||||\\         [___________]
      ======          | | | | | |
      ||||||          | | | | | |
      ||||||          | | | | | |
      ||||||          |_________|
      `
  );

  const args = await yargs(process.argv.slice(2))
    .usage(
      `
      Deletes unused S3 buckets. Can only be run in low risk
      accounts like integration tests because it needs s3:DeleteObject
      and s3:DeleteBucket permissions which the standard safe roles
      don't have.

      NOTE: You will need to run this for each region - s3 is a "global"
      service, but buckets are regional. This means list buckets will
      list all buckets globally, but a region must be specified to delete.
      You will see "Permenent Redirect" errors for the buckets that are
      not in the region you've specified.

      Usage:
        brazil-build s3janitor -- --region=iad --accountId=1111111111

      Dry Run:
        brazil-build s3janitor -- --region=iad --accountId=1111111111 --dryRun
      `
    )
    .option("region", {
      describe: "The region or airport code (i.e. iad, or us-east-1)",
      type: "string",
      demandOption: true,
    })
    .option("roleName", {
      describe: "IAM role to assume to delete functions",
      type: "string",
      default: "Admin",
      demandOption: true,
    })
    .option("accountId", {
      describe: "AWS account to delete functions from",
      type: "string",
      demandOption: true,
    })
    .option("dryRun", {
      describe: "Output bucket names that will be deleted",
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, roleName, accountId, dryRun } = args;
  const regionName = toRegionName(region);

  const s3Client = new S3Client({
    region: regionName,
    credentials: getIsengardCredentialsProvider(accountId, roleName),
  });

  const cloudFrontClient = new CloudFrontClient({
    region: regionName,
    credentials: getIsengardCredentialsProvider(accountId, roleName),
  });

  const cloudFrontClientIAD = new CloudFrontClient({
    region: "iad",
    credentials: getIsengardCredentialsProvider(accountId, roleName),
  });

  logger.info(
    "Gathering all s3 buckets associated with CloudFront distributions"
  );

  // We need to gather buckets from the assigned region AND iad - most of our tests run
  // in iad and we do not want to remove resources utilized in this region.
  const regionCloudFrontBuckets = await listS3BucketsForDistributions(
    cloudFrontClient
  );
  const iadCloudFrontBuckets = await listS3BucketsForDistributions(
    cloudFrontClientIAD
  );
  const cloudFrontBuckets = [
    ...regionCloudFrontBuckets,
    ...iadCloudFrontBuckets,
  ];

  const cloudFrontBucketMap: { [key: string]: boolean } = {};
  cloudFrontBuckets.forEach((bucket) => (cloudFrontBucketMap[bucket] = true));

  logger.info("Listing S3 Buckets");

  const buckets = await listBuckets(s3Client);
  const bucketNamesToDelete = buckets
    .map((bucket) => bucket.Name || "")
    // Do not remove buckets that are mapped to CloudFront distros
    .filter((bucketName) => {
      if (!cloudFrontBucketMap[bucketName]) {
        return true;
      }
      logger.info(
        `Skipping ${bucketName} because it's assigned to CloudFront distro`
      );
      return false;
    })
    .filter((bucketName) => bucketName) // Remove empty bucket names
    .filter((bucketName) => !bucketName.includes("do-not-delete"))
    .filter(
      (bucketName) =>
        /^[a-z0-9]{5,8}-[a-z0-9]{5,8}$/.test(bucketName || "") || // Matches bucket names like: 9ftwr85-0wdhhac
        /^backend-app-.*?-master-.*?-deployment$/.test(bucketName || "") || // Matches bucket names like: backend-app-a2f4b679-master-231458-deployment
        /^amplify-.*?-master-.*?-deployment$/.test(bucketName || "") || // Matches bucket names like: amplify-amplifye93f6aa840164-master-04817-deployment
        /^amplify-.*?-staging-.*?-deployment$/.test(bucketName || "") // Matches bucket names like: amplify-amplifye93f6aa840164-staging-04817-deployment
    );

  logger.info({ bucketsToDelete: bucketNamesToDelete }, "Buckets to delete");

  if (dryRun) {
    logger.info("Exiting without deleting buckets");
    return;
  }

  if (
    bucketNamesToDelete.length > 0 &&
    (await confirm("Are you sure you want to delete these buckets?"))
  ) {
    // Delete them in parallel with rate limit
    const deletions = bucketNamesToDelete.map((bucketName) =>
      deleteBucketRateLimit(() => deleteBucket(s3Client, bucketName!))
    );

    await Promise.all(deletions);
    logger.info("Finished deleting buckets");
  }
}

async function listBuckets(s3Client: S3Client) {
  const listBucketsCommand = new ListBucketsCommand({});
  const { Buckets: buckets } = await s3Client.send(listBucketsCommand);

  if (!buckets) {
    logger.error("No buckets found");
    return [];
  }

  return buckets;
}

async function emptyBucket(s3Client: S3Client, bucketName: string) {
  try {
    // List all objects in the bucket
    const listObjectsParams = {
      Bucket: bucketName,
    };
    const listObjectsCommand = new ListObjectsCommand(listObjectsParams);
    const { Contents: s3ObjectArray } = await s3Client.send(listObjectsCommand);

    if (!s3ObjectArray) {
      logger.info({ bucketName }, "Bucket is already empty.");
      return;
    }

    const safeToDelete = s3ObjectArray
      .filter((object) => object.Key)
      .map((object) => ({ Key: object.Key }));

    // Delete each object in the bucket
    const deleteObjectsCommand = new DeleteObjectsCommand({
      Bucket: bucketName,
      Delete: {
        Objects: safeToDelete,
      },
    });
    await s3Client.send(deleteObjectsCommand);

    logger.info({ bucketName }, "Bucket emptied");
  } catch (error) {
    logger.error(error, "Error emptying the bucket:");
  }
}

async function deleteBucket(s3Client: S3Client, bucketName: string) {
  try {
    // Empty the bucket first
    await emptyBucket(s3Client, bucketName);

    // Delete the empty bucket
    const deleteBucketParams = {
      Bucket: bucketName,
    };
    const deleteBucketCommand = new DeleteBucketCommand(deleteBucketParams);
    await s3Client.send(deleteBucketCommand);

    logger.info({ bucketName }, "Bucket deleted");
  } catch (error) {
    logger.error(error, "Error deleting the bucket:");
  }
}

async function listS3BucketsForDistributions(
  cloudfrontClient: CloudFrontClient
): Promise<string[]> {
  let cloudFrontS3Buckets: string[] = [];

  try {
    let lastDistributionResponse = null;
    // List CloudFront distributions
    do {
      const distributionsResponse: ListDistributionsCommandOutput =
        await cloudfrontClient.send(
          new ListDistributionsCommand({
            Marker: lastDistributionResponse?.DistributionList?.NextMarker,
          })
        );
      lastDistributionResponse = distributionsResponse;

      // Loop through distributions
      for (const distribution of distributionsResponse?.DistributionList
        ?.Items || []) {
        // Loop through S3 origins
        for (const origin of distribution?.Origins?.Items || []) {
          if (origin.Id) {
            const s3BucketName = origin.Id;
            cloudFrontS3Buckets.push(s3BucketName || "");
          }
        }
      }
    } while (lastDistributionResponse?.DistributionList?.IsTruncated);
  } catch (error) {
    console.error("Error listing CloudFront distributions:", error);
  }

  return cloudFrontS3Buckets.filter((x) => x);
}

main()
  .then(() => logger.info("Done"))
  .catch((e) => logger.error(e));
