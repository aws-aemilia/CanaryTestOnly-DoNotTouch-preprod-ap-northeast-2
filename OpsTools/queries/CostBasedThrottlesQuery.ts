import {
  AmplifyAccount,
  dataPlaneAccounts,
  StandardRoles,
} from "Commons/Isengard";
import { Log } from "Commons/libs/CloudWatch";
import dayjs from "dayjs";
import { appendFile } from "node:fs/promises";
import path from "path";
import { Query, QueryConfig } from "../batchQuery";

export class CostBasedThrottlesQuery implements QueryConfig {
  public handleLogs(
    { account }: Query,
    logs: Log[],
    session: string
  ): Promise<void> {
    const logsString = logs.map((l) => this.logToCsv(account, l)).join("");

    const filename = path.join(
      __dirname,
      "..",
      "tmp",
      `cost-based-throttling-${session}.csv`
    );

    return appendFile(filename, logsString);
  }

  async getQueries(): Promise<Query[]> {
    const role = StandardRoles.ReadOnly;
    const accounts = await dataPlaneAccounts({ stage: "prod" });
    const logGroupPrefix = "HostingGateway/ServiceMetrics/prod";
    const query =
      "fields appId, TotalBytesSent, TTFB, greatest(0.05, 2*TTFB + 0.00000001*TotalBytesSent) as cost | filter ispresent(TTFB) | stats sum(cost) as costPerSec by appId, bin(1s) as time | sort by costPerSec desc";

    const dates: [string, string][] = [];
    const today = dayjs();
    for (let i = 0; i < 14; i++) {
      dates.push([
        today.subtract(i + 1, "day").toISOString(),
        today.subtract(i, "day").toISOString(),
      ]);
    }

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
    return `${a.accountId},${a.region},${l["time"]},${l["appId"]},${l["costPerSec"]}\n`;
  }
}
