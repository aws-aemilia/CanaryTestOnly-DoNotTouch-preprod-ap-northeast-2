import { getIsenLink, getLogStreamLink } from "Commons/DeepLinks";
import {
  AmplifyAccount,
  controlPlaneAccounts,
  StandardRoles,
} from "Commons/Isengard";
import { Log } from "Commons/libs/CloudWatch";
import { appendFileSync } from "node:fs";
import path from "path";
import { Query, QueryConfig } from "../batchQuery";
import { encodeForCsv } from "./csvUtils";
import { getLastNDates } from "./timeRange";

export class WeeklyControlPlaneQuery implements QueryConfig {
  public handleLogs(
    { account }: Query,
    logs: Log[],
    session: string
  ): Promise<void> {
    const logsString = logs.map((l) => this.logToCsv(account, l)).join("");

    const filename = path.join(
      __dirname,
      "..",
      "..",
      "tmp",
      `weekly-control-plane-${session}.csv`
    );

    appendFileSync(filename, logsString);
    return Promise.resolve();
  }

  async getQueries(): Promise<Query[]> {
    const role = StandardRoles.ReadOnly;
    const accounts = await controlPlaneAccounts({ stage: "prod" });
    const logGroupPrefix =
      "/aws/lambda/AemiliaControlPlaneLambda-LambdaFunction";
    const query = `fields @timestamp, @logStream, logGroup, operation, exception, requestId, @message
        | filter fault=1
        | limit 10000`;

    const dates = getLastNDates(7);

    return accounts.flatMap((a) =>
      dates.map((d) => ({
        account: a,
        role,
        logGroupPrefix,
        query,
        startEndDate: d,
      }))
    );
  }

  private logToCsv(a: AmplifyAccount, l: Log): string {
    const message = encodeForCsv(l["@message"]);
    const exception = encodeForCsv(l["exception"]);
    const timestamp = l["@timestamp"];
    const logGroup = l["logGroup"];
    const logStreamLink = getIsenLink(
      a.accountId,
      StandardRoles.FullReadOnly,
      getLogStreamLink(logGroup, l["@logStream"], new Date(timestamp), a.region)
    );

    return `${a.accountId},${a.airportCode},${timestamp},${l["operation"]},${exception},${l["requestId"]},${message},${logStreamLink}\n`;
  }
}
