import { readReportedAccountIds } from "../reportedAccounts";

export function getReportedAccountIds({
  accountId,
  reportedAfter,
}: {
  accountId?: string;
  reportedAfter?: string;
}): string[] {
  const reportedAccountIds = readReportedAccountIds();

  if (accountId !== undefined) {
    if (reportedAccountIds[accountId]) {
      return [accountId];
    } else {
      throw new Error(
        `Account ${accountId} not found in reportedAccounts JSON file`
      );
    }
  }

  return Object.entries(reportedAccountIds)
    .filter(
      ([, reportedAccountId]) =>
        reportedAfter === undefined ||
        reportedAccountId.reportedOn > reportedAfter
    )
    .map(([accountId]) => accountId);
}
