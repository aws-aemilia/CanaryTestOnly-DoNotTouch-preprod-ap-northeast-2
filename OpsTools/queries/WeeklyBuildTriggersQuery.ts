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
import { getLogStreamLink } from "Commons/DeepLinks";

export class WeeklyBuildTriggersQuery implements QueryConfig {
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
      `weekly-build-trigger-${session}.csv`
    );

    appendFileSync(filename, logsString);
    return Promise.resolve();
  }

  async getQueries(): Promise<Query[]> {
    const role = StandardRoles.ReadOnly;
    const accounts = await controlPlaneAccounts({ stage: "prod" });
    const logGroupPrefixes = [
      "/aws/lambda/AemiliaWebhookProcessorLambda-WebHookHandler",
      "/aws/lambda/AemiliaWebhookProcessorLamb-IncomingWebhookHandler",
      "/aws/lambda/AemiliaWebhookProcessorLambda-WebPreviewHandler",
      "/aws/lambda/AemiliaWebhookProcessorLambda-CodeCommitHandler",
      "/aws/lambda/AemiliaWebhookProcessorLambda-PostJobHandler",
      "/aws/lambda/AemiliaWebhookProcessorLam-GitHubValidationHandler",
      "/aws/lambda/TriggerBuild",
      "/aws/lambda/RunNextJob",
      "/aws/lambda/AemiliaWebhookProcessorLambda-JobHealthCheck",
      "/aws/lambda/BuildSecretsHandler",
    ];

    const query = `fields @timestamp, @message
        | filter fault=1
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
    return `${a.accountId},${a.airportCode},${logGroupPrefix},${l["@timestamp"]},${message}\n`;
  }
}
