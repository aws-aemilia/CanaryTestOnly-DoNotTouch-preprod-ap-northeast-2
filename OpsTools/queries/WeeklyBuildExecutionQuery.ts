import {
  AmplifyAccount,
  controlPlaneAccounts,
  StandardRoles,
} from "Commons/Isengard";
import { Log } from "Commons/libs/CloudWatch";
import { appendFileSync } from "node:fs";
import path from "path";
import { Query, QueryConfig } from "../batchQuery";
import { getLastNDates } from "./timeRange";
import { encodeForCsv } from "./csvUtils";
import { getIsenLink, getLogStreamLink } from "Commons/DeepLinks";

export class WeeklyBuildExecutionQuery implements QueryConfig {
  public handleLogs(
    { account, logGroupPrefix }: Query,
    logs: Log[],
    session: string
  ): Promise<void> {
    const logsString = logs
      .map((l) => this.logToCsv(account, logGroupPrefix, l))
      .join("");

    const filename = path.join(
      __dirname,
      "..",
      "..",
      "tmp",
      `weekly-build-execution-${session}.csv`
    );

    appendFileSync(filename, logsString);
    return Promise.resolve();
  }

  async getQueries(): Promise<Query[]> {
    const role = StandardRoles.FullReadOnly;
    const accounts = await controlPlaneAccounts({ stage: "prod" });
    const logGroupPrefixes = ["AWSCodeBuild"];

    const query = `fields @timestamp, errorMessage, @logStream, @message
        | filter isFault=1
        | order by @timestamp asc
        | limit 10000`;

    const dates = getLastNDates(7);

    return logGroupPrefixes.flatMap((logGroupPrefix) =>
      accounts.flatMap((a) =>
        dates.map((d) => ({
          account: a,
          role,
          logGroupPrefix,
          query,
          startEndDate: d,
        }))
      )
    );
  }

  private logToCsv(a: AmplifyAccount, logGroupPrefix: string, l: Log): string {
    const message = encodeForCsv(l["@message"]);
    const errorMessage = encodeForCsv(l["errorMessage"]);
    const timestamp = l["@timestamp"];
    const logStreamLink = getIsenLink(
      a.accountId,
      StandardRoles.FullReadOnly,
      getLogStreamLink(
        "AWSCodeBuild",
        l["@logStream"],
        new Date(timestamp),
        a.region
      )
    );
    return `${a.accountId},${a.airportCode},${logGroupPrefix},${l["@timestamp"]},${logStreamLink},${errorMessage},${message}\n`;
  }
}
