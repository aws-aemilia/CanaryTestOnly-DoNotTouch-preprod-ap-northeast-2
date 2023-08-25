import { OncallReport, Pain, ReportEntry } from "./types";
import dayjs from "dayjs";

export function toWikiSyntax(oncallReport: OncallReport): string {
  const tables = Object.entries(oncallReport.entriesByCategory)
    .map(([category, entries]) => toWikiTable(category, entries))
    .join("\n\n");

  const title = "== Pages Report ==";
  const summary = toWikiSummary(oncallReport);
  return [title, summary, tables].join("\n");
}

function toWikiSummary(oncallReport: OncallReport): string {
  return `
|=(% style="background-color: rgb(237, 237, 237);" %)Summary
|**${painEmoji(Pain.WorkingHours)} Working hours pages**: ${
    oncallReport.workingHourPages
  }
|**${painEmoji(Pain.AfterHours)} After hours pages**: ${
    oncallReport.afterHourPages
  }
|**${painEmoji(Pain.SleepingHours)} Sleeping hours pages**: ${
    oncallReport.sleepingHourPages
  }
|**Total Pages**: ${oncallReport.totalPages}
  `;
}

function toWikiTable(title: string, reportEntries: ReportEntry[]): string {
  const tableHeader = [
    `|=(% style="width: 10%;" %)Ticket`,
    `|=(% style="width: 40%;" %)Subject`,
    `|=(% style="width: 30%;" %)Root Cause`,
    `|=(% style="width: 8%;" %)Time Spent`,
    `|=(% style="width: 12%;" %)Timestamps`,
  ].join("");

  const rows = reportEntries
    .map((e: ReportEntry) => {
      const ticketLink = e.ticketId
        ? toWikiLink(e.ticketId, `https://t.corp.amazon.com/${e.ticketId}`)
        : "N/A";
      const subject = toWikiText(e.pageSubject);
      const rootCause = toWikiText(e.rootCause || "N/A");
      const timeSpent = `${e.timeSpentMinutes} minutes`;
      const timeWithPainEmoji = `${painEmoji(e.pain)} ${toHumanDate(
        e.pageTimestamp
      )}`;
      return toWikiRow([
        ticketLink,
        subject,
        rootCause,
        timeSpent,
        timeWithPainEmoji,
      ]);
    })
    .join("\n");

  const tableTitle = `=== ${title} ===`;
  return [tableTitle, tableHeader, rows].join("\n");
}

function toWikiRow(columns: string[]): string {
  return "|".concat(columns.join("|")).concat("\\\\");
}

function toWikiLink(text: string, link: string) {
  return `[[${text}>>${link}]]`;
}

function toWikiText(text: string) {
  return `{{{${text}}}}`;
}

function toHumanDate(date: Date) {
  return dayjs(date).format("YYYY-MM-DD HH:mm");
}

function painEmoji(pain: Pain): string {
  switch (pain) {
    case Pain.WorkingHours:
      return "🙂";
    case Pain.AfterHours:
      return "☹️";
    case Pain.SleepingHours:
      return "😡";
  }
}
