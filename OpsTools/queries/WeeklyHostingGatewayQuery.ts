import {
  AmplifyAccount,
  dataPlaneAccounts,
  StandardRoles,
} from "Commons/Isengard";
import { Log } from "Commons/libs/CloudWatch";
import { appendFileSync } from "node:fs";
import path from "path";
import { Query, QueryConfig } from "../batchQuery";
import { encodeForCsv } from "./csvUtils";
import { getNDaysBefore } from "./timeRange";

export class WeeklyHostingGatewayQuery implements QueryConfig {
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
      `weekly-hosting-gateway-${session}.csv`
    );

    appendFileSync(filename, logsString);
    return Promise.resolve();
  }

  async getQueries(): Promise<Query[]> {
    const role = StandardRoles.ReadOnly;
    const accounts = await dataPlaneAccounts({ stage: "prod" });
    const logGroupPrefix = "HostingGateway/ApplicationLogs/prod";
    const query = `fields time, AccountId, AppId, error_code, error_message, CFRequestId, @logStream, @message
    | filter fault=1
    | sort by time desc
    | limit 10000`;

    const dates = getNDaysBefore(7, new Date());

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
    const errorCode = l["error_code"] || "";
    const errorMessage = l["error_message"] || "";
    const appId = l["AppId"] || "";
    const accountId = l["AccountId"] || "";
    const requestId = l["CFRequestId"] || "";
    const message = encodeForCsv(l["@message"]);
    const timestamp = l["@timestamp"];

    return `${a.accountId},${a.airportCode},${timestamp},${errorCode},${errorMessage},${appId},${accountId},${requestId},${message}\n`;
  }
}
