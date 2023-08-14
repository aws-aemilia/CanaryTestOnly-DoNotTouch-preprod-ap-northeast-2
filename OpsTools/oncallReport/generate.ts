import fs from "fs";
import dayjs from "dayjs";
import yargs from "yargs";
import logger from "../../Commons/utils/logger";
import { whoAmI } from "../../Commons/utils";
import { PagingClient } from "../../Commons/paging";
import { TicketyService } from "../../Commons/SimT/Tickety";
import {getCategory, groupByCategory} from "./categories";
import { OncallReport, Pain, ReportEntry } from "./types";
import { toWikiSyntax } from "./wiki";
import { TicketReference } from "@amzn/tickety-typescript-sdk";

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
    .strict()
    .version(false)
    .help().argv;

  const alias = whoAmI();
  const today = dayjs().hour(9).minute(0);
  const oneWeekAgo = dayjs(today).subtract(7, "day");

  const pagingClient = new PagingClient(alias);
  const ticketyService = new TicketyService();

  logger.info(
    "Fetching all the pages you received from %s to %s",
    oneWeekAgo.format("MM/DD HH:mm"),
    today.format("MM/DD HH:mm")
  );

  const pages = await pagingClient.listPages(
    oneWeekAgo.toDate(),
    today.toDate()
  );
  pages.reverse();  // Reverse the order of pages so that they're displayed from oldest to newest

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
        rootCause: "No ticket associated to this page.",
        timeSpentMinutes: 0,
        category: getCategory(page.subject),
        pain: toPain(page.sentTime),
      });
      continue;
    }

    logger.info("Fetching ticket %s", page.ticketId);
    const ticket = await ticketyService.getTicket(page.ticketId);

    if (!ticket || !ticket.ticketId) {
      // This can happen if you don't have permissions to access the ticket
      logger.warn("Unable to get ticket %s", page.ticketId);
      reportEntries.push({
        pageTimestamp: page.sentTime,
        pageSubject: page.subject,
        rootCause: "No ticket associated to this page.",
        timeSpentMinutes: 0,
        category: getCategory(page.subject),
        pain: toPain(page.sentTime),
      });
      continue;
    }

    reportEntries.push({
      pageTimestamp: page.sentTime,
      pageSubject: page.subject,
      ticketId: page.ticketId,
      rootCause: getRootCauseText(ticket),
      timeSpentMinutes: ticket.totalTimeSpentInMinutes || 0,
      category: getCategory(page.subject),
      pain: toPain(page.sentTime),
    });
  }

  logger.info("Generating report in JSON and Wiki formats");
  const oncallReport = createReport(reportEntries);
  const wikiSyntax = toWikiSyntax(oncallReport);
  const jsonReport = JSON.stringify(oncallReport, null, 2);

  logger.info("Writing report to files");
  writeToFile(wikiSyntax, "wiki");
  writeToFile(jsonReport, "json");
  logger.info("You're all set! 🎉");
}

function createReport(entries: ReportEntry[]): OncallReport {
  const entriesByCategory = groupByCategory(entries);
  const workingHourPages = entries.filter(e => e.pain === Pain.WorkingHours).length;
  const afterHourPages = entries.filter(e => e.pain === Pain.AfterHours).length;
  const sleepingHourPages = entries.filter(e => e.pain === Pain.SleepingHours).length;

  return {
    workingHourPages,
    afterHourPages,
    sleepingHourPages,
    totalPages: entries.length,
    entriesByCategory,
  };
}

function writeToFile(content: string, extension: string) {
  const reportName = `oncall-report-${dayjs().format("YYYY-MM-DD")}.${extension}`;
  fs.writeFileSync(reportName, content);
  logger.info("Report saved at %s", reportName);
}

function toPain(pageTimestamp: Date): Pain {
  const pageTime = dayjs(pageTimestamp);
  if (pageTime.hour() >= 8 && pageTime.hour() <= 17) {
    return Pain.WorkingHours;
  } else if (pageTime.hour() > 17 && pageTime.hour() < 22) {
    return Pain.AfterHours;
  } else {
    return Pain.SleepingHours;
  }
}

function getRootCauseText(ticket: TicketReference) {
  return [
      ticket.rootCause,
      ticket.rootCauseDetails,
  ].join(". ");
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
