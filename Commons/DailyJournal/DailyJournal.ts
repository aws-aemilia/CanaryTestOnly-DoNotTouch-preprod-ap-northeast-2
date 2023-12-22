import { Adms } from "@amzn/aws-fraud-types";
import { NoSuchKey, S3 } from "@aws-sdk/client-s3";
import { STS } from "@aws-sdk/client-sts";
import { AwsCredentialIdentity } from "@aws-sdk/types";

import fs from "fs";
import os from "os";
import path from "path";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  StandardRoles,
} from "../Isengard";
import { toAirportCode } from "../utils/regions";
import AccountEventMessage = Adms.AccountEventMessage;

/**
 * This class facilitates reading files from AES's Daily Journal S3 bucket.
 */
export class DailyJournal {
  private readonly s3: S3;

  private constructor(s3: S3) {
    this.s3 = s3;
  }

  /**
   * Create a new DailyJournal client for retrieving events from the Daily Journal S3 bucket.
   *
   * Assuming a role via STS is an asynchronous operation, which can't be put in this class's default constructor, hence
   * why this build() function is used.
   */
  public static async build(): Promise<DailyJournal> {
    const credentials = await getCredentialsForGdprRole();
    const s3 = new S3({ region: "us-east-1", credentials });
    return new DailyJournal(s3);
  }

  /**
   * Get the Daily Journal events for a given date and region. The results will be cached in your home directory to
   * inspect as needed.
   * @param date
   * @param region
   */
  async getEventsForDate(
    date: Date,
    region: Region
  ): Promise<{ dateAndRegion: string; events: AccountEventMessage[] }> {
    const { s3Key, localPath } = getS3KeyAndLocalPath(date, region);

    // First, attempt to read the local file, if it exists
    if (fs.existsSync(localPath)) {
      return {
        dateAndRegion: s3Key,
        events: JSON.parse(fs.readFileSync(localPath).toString()),
      };

      // Next, attempt to get the file from S3
    } else {
      try {
        const getObjectCommandOutput = await this.s3.getObject({
          Bucket: "resource-events-prod-daily-journal",
          Key: s3Key,
        });

        // If the file was found in S3, cache the file locally and return its data
        const events =
          (await getObjectCommandOutput.Body?.transformToString()) ?? "[]";
        fs.mkdirSync(path.dirname(localPath), { recursive: true });
        fs.writeFileSync(localPath, events);
        return { dateAndRegion: s3Key, events: JSON.parse(events) };

        // If the file wasn't found in S3, assume that there is no data for the given date and region
      } catch (e) {
        if (e instanceof NoSuchKey) {
          return { dateAndRegion: s3Key, events: [] };
        } else {
          throw e;
        }
      }
    }
  }

  /**
   * Get the Daily Journal events for a given range of dates and a region. The results will be cached in your home
   * directory to inspect as needed.
   *
   * Since the volume of data can cause out-of-memory errors, this function returns a generator, to encourage the use of
   * for-await-of loops.
   * @param startDate
   * @param endDate
   * @param region
   */
  async *getEvents(startDate: Date, endDate: Date, region: Region) {
    const dates = getDatesBetween(startDate, endDate);
    if (dates.length === 0) {
      throw new Error("Invalid date range.");
    }

    for (const date of dates) {
      yield await this.getEventsForDate(date, region);
    }
  }
}

/**
 * Get the credentials for the GDPR role which is used to get Daily Journal files.
 */
async function getCredentialsForGdprRole(): Promise<AwsCredentialIdentity> {
  // We default to using the beta Control Plane account to instantiate the STS client.
  const account = await controlPlaneAccount("beta", "us-west-2");
  const sts = new STS({
    region: account.region,
    credentials: getIsengardCredentialsProvider(
      account.accountId,
      StandardRoles.OncallOperator
    ),
  });

  // The role ARN can be constructed following these instructions: https://tiny.amazon.com/guksjz63
  const assumeRoleCommandOutput = await sts.assumeRole({
    RoleArn: `arn:aws:iam::320900696344:role/amplify/GDPRDJR-amplify-${account.accountId}-1`,
    RoleSessionName: "AmplifyHostingOpsToolDailyJournalQuery",
  });

  // The response from STS annoyingly capitalizes these fields, so we need to manually construct the
  // AwsCredentialIdentity object.
  return {
    accessKeyId: assumeRoleCommandOutput.Credentials?.AccessKeyId ?? "",
    secretAccessKey: assumeRoleCommandOutput.Credentials?.SecretAccessKey ?? "",
    sessionToken: assumeRoleCommandOutput.Credentials?.SessionToken ?? "",
  };
}

/**
 * Get a range of Date object between two dates. This includes the start date
 * and excludes the end date, i.e. [startDate, endDate).
 * @param startDate
 * @param endDate
 */
function getDatesBetween(startDate: Date, endDate: Date) {
  const dateToAdd = startDate;
  const dates = [];
  while (dateToAdd < endDate) {
    dates.push(new Date(dateToAdd));
    dateToAdd.setDate(dateToAdd.getDate() + 1);
  }
  return dates;
}

/**
 * Get the S3 key and local path (in this case, your home directory) of the Daily Journal file for a given date and
 * region.
 * @param date
 * @param region
 */
function getS3KeyAndLocalPath(date: Date, region: Region) {
  const slashedDate = date
    .toISOString() // 2023-01-01T01:01:01.001Z
    .split("T")[0] // 2023-01-01
    .replace(/-/g, "/"); // 2023/01/01

  const s3Key = `${slashedDate}/${toAirportCode(region)}Events`;
  const localPath: string = path.resolve(
    os.homedir(),
    "DailyJournalFiles",
    s3Key
  );

  return { s3Key, localPath };
}
