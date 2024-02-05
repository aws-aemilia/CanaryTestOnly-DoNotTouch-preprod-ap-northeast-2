import { TicketReference } from "@amzn/tickety-typescript-sdk";
import { PagingClient } from "Commons/paging";
import { TicketyService } from "Commons/SimT/Tickety";
import { whoAmI } from "Commons/utils";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import fs from "fs";
import yargs from "yargs";
import logger from "../../Commons/utils/logger";
import { getCategory, groupByCategory } from "./categories";
import { OncallReport, Pain, ReportEntry } from "./types";
import { toWikiSyntax } from "./wiki";

dayjs.extend(utc);
dayjs.extend(timezone);

async function main() {
  console.log(welcomeMessage());
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Generates the weekly report for the SEV2s that happened in the last 7 days.
       It uses midway authentication, be sure to run mwinit.
       
       Usage:
       brazil-build generateOncallReport
      `
    )
    .option("commonRootCauseThreshold", {
      describe:
        "The minimum number of tickets that need to share the same root cause to be grouped together. Tip: Set to 99 to disable",
      type: "number",
      default: 3,
    })
    .option("timezone", {
      describe: "The timezone to use for timestamps and time range counts.",
      type: "string",
      default: "America/Los_Angeles",
    })
    .strict()
    .version(false)
    .help().argv;

  const { commonRootCauseThreshold, timezone } = args;

  const reportEntries = await getReportEntries(timezone);
  const oncallReport = createReport(reportEntries, commonRootCauseThreshold);

  logger.info("Generating report in JSON and Wiki formats");
  const wikiSyntax = toWikiSyntax(oncallReport, timezone);
  const jsonReport = JSON.stringify(oncallReport, null, 2);

  logger.info("Writing report to files");
  writeToFile(wikiSyntax, "wiki");
  writeToFile(jsonReport, "json");
  logger.info("You're all set! 🎉");
}

function createReport(
  entries: ReportEntry[],
  commonRootCauseThreshold: number
): OncallReport {
  const entriesByCategory = groupByCategory(entries, commonRootCauseThreshold);
  const workingHourPages = entries.filter(
    (e) => e.pain === Pain.WorkingHours
  ).length;

  const afterHourPages = entries.filter(
    (e) => e.pain === Pain.AfterHours
  ).length;

  const sleepingHourPages = entries.filter(
    (e) => e.pain === Pain.SleepingHours
  ).length;

  return {
    workingHourPages,
    afterHourPages,
    sleepingHourPages,
    totalPages: entries.length,
    entriesByCategory,
  };
}

async function getReportEntries(timezone: string): Promise<ReportEntry[]> {
  const today = dayjs().hour(9).minute(0);
  const oneWeekAgo = dayjs(today).subtract(7, "day");

  logger.info(
    "Fetching all the pages you received from %s to %s",
    oneWeekAgo.format("MM/DD HH:mm"),
    today.format("MM/DD HH:mm")
  );

  const pagingClient = new PagingClient(whoAmI());
  const ticketyService = new TicketyService();

  const pages = await pagingClient.listPages(
    oneWeekAgo.toDate(),
    today.toDate()
  );

  pages.reverse(); // Reverse the order of pages so that they're displayed from oldest to newest

  logger.info("Looks like you got %s pages.", pages.length);
  const reportEntries: ReportEntry[] = [];
  logger.info("Looping through each page to get ticket information");

  for (const page of pages) {
    if (!page.ticketId) {
      // This typically happens when a page was sent by a person directly to you.
      logger.warn(
        "Page sent by %s has no ticket associated to it",
        page.sender
      );

      reportEntries.push({
        pageTimestamp: page.sentTime,
        pageSubject: page.subject,
        rootCauseText: "No ticket associated to this page.",
        timeSpentMinutes: 0,
        category: getCategory(page.subject),
        pain: toPain(page.sentTime, timezone),
      });
      continue;
    }

    logger.info("Fetching ticket %s", page.ticketId);
    const ticket = await ticketyService.getTicket(page.ticketId);

    if (!ticket || !ticket.ticketId) {
      logger.warn(
        "Unable to fetch ticket %s. It may be a secure ticket",
        page.ticketId
      );
      reportEntries.push({
        ticketId: page.ticketId,
        pageTimestamp: page.sentTime,
        pageSubject: page.subject,
        rootCauseText: "Unable to fetch root cause",
        timeSpentMinutes: 0,
        category: getCategory(page.subject),
        pain: toPain(page.sentTime, timezone),
      });
      continue;
    }

    reportEntries.push({
      pageTimestamp: page.sentTime,
      pageSubject: page.subject,
      ticketId: page.ticketId,
      ticketStatus: ticket.status,
      rootCause: ticket.rootCause,
      rootCauseText: getRootCauseText(ticket),
      timeSpentMinutes: ticket.totalTimeSpentInMinutes || 0,
      category: getCategory(page.subject),
      pain: toPain(page.sentTime, timezone),
    });
  }

  return reportEntries;
}

function writeToFile(content: string, extension: string) {
  const reportName = `oncall-report-${dayjs().format(
    "YYYY-MM-DD"
  )}.${extension}`;
  fs.writeFileSync(reportName, content);
  logger.info("Report saved at %s", reportName);
}

function toPain(pageTimestamp: Date, timezone: string): Pain {
  const pageTime = dayjs(pageTimestamp).tz(timezone);
  if (pageTime.hour() >= 8 && pageTime.hour() <= 17) {
    return Pain.WorkingHours;
  } else if (pageTime.hour() > 17 && pageTime.hour() < 22) {
    return Pain.AfterHours;
  } else {
    return Pain.SleepingHours;
  }
}

function getRootCauseText(ticket: TicketReference) {
  return [ticket.rootCause, ticket.rootCauseDetails].join(". ");
}

function welcomeMessage() {
  return `
   ------------------------------------------------------------------------
  |  Hey there, ready to shine as an Ops Champion in front of your team?  |
  |  Pop some popcorn 🍿 because we're about to recap your on-call week   |
  |  in just a few seconds.                                               |
   ------------------------------------------------------------------------
  `;
}

main()
  .then(() => logger.info("Done"))
  .catch((err) => logger.error(err));
