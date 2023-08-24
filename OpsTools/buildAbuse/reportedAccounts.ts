import fs from "fs";
import path from "path";

export type ReportedAccounts = {
  [accountId: string]: ReportedAccount;
};

export type ReportedAccount = {
  reportedOn: string;
  ticket?: string;
  disabled?: boolean;
};

export const reportedAccountsFile = path.join(__dirname, "account_reported.json");

export function readReportedAccountIds(): ReportedAccounts {
  return JSON.parse(fs.readFileSync(reportedAccountsFile, "utf8"));
}
