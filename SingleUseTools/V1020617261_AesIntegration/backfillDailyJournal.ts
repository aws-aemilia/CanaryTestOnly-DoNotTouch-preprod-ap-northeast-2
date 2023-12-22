import { Adms } from "@amzn/aws-fraud-types";
import { SQS } from "@aws-sdk/client-sqs";
import { DailyJournal } from "Commons/DailyJournal/DailyJournal";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  StandardRoles,
} from "Commons/Isengard";

import fs from "fs";
import os from "os";
import path from "path";
import yargs from "yargs";

const completedFilesPath = path.resolve(
  os.homedir(),
  "DailyJournalFiles",
  "completedFiles.txt"
);

type EventFile = {
  dateAndRegion: string;
  events: Adms.AccountEventMessage[];
};

async function processDateClosure(sqs: SQS, eventFile: EventFile) {
  const { dateAndRegion, events } = eventFile;

  const completedFiles = fs
    .readFileSync(completedFilesPath, "utf8")
    .split("\n");

  if (!completedFiles.includes(dateAndRegion)) {
    console.log(`Backfilling ${dateAndRegion}`);

    const entries = events.map((event) => {
      return {
        Id: event.eventId,
        MessageBody: JSON.stringify({ Message: JSON.stringify(event) }),
      };
    });

    const batches = spliceIntoChunks(entries, 10);

    const sendMessageBatchPromises = batches.map(async (batch) => {
      await sqs.sendMessageBatch({
        QueueUrl: "AccountClosingQueue",
        Entries: batch,
      });
    });

    await Promise.all(sendMessageBatchPromises);

    fs.appendFileSync(completedFilesPath, `${dateAndRegion}\n`);
  }
}

async function main() {
  const args = await yargs(process.argv.slice(2))
    .usage("")
    .option("region", {
      describe: "",
      type: "string",
      demandOption: true,
    })
    .option("startDate", {
      describe: "",
      type: "string",
      demandOption: true,
    })
    .option("endDate", {
      describe: "",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { region, startDate, endDate } = args;

  const dailyJournal = await DailyJournal.build();
  const account = await controlPlaneAccount("prod", region as Region);
  const role = StandardRoles.OncallOperator;
  await preflightCAZ({ accounts: account, role });

  const sqs = new SQS({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId, role),
  });

  // https://aws.amazon.com/about-aws/whats-new/2020/11/aws-amplify-hosting-generally-available-milan-bahrain-hong-kong-regions/
  const eventFiles = dailyJournal.getEvents(
    new Date(startDate),
    new Date(endDate),
    account.region as Region
  );

  let closures = [];
  for await (const eventFile of eventFiles) {
    closures.push(processDateClosure(sqs, eventFile));
    if (closures.length >= 4) {
      await Promise.all(closures);
      closures = [];
    }
  }
  await Promise.all(closures);
}

function spliceIntoChunks<T>(arr: T[], chunkSize: number) {
  const res: T[][] = [];
  while (arr.length > 0) {
    const chunk = arr.splice(0, chunkSize);
    res.push(chunk);
  }
  return res;
}

main().catch(console.error);
