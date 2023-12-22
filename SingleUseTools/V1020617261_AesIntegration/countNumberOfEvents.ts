import { DailyJournal } from "Commons/DailyJournal/DailyJournal";
import { Region } from "Commons/Isengard";

async function main() {
  const dailyJournal = await DailyJournal.build();
  const startDate = new Date(2020, 10, 11);
  const endDate = new Date(2023, 8, 1);
  const region: Region = "MXP";

  const eventFiles = dailyJournal.getEvents(startDate, endDate, region);

  let sum = 0;
  for await (const { dateAndRegion, events } of eventFiles) {
    sum += events.length;
  }
  console.log(
    `From ${startDate} to ${endDate} in ${region}, there were ${sum} AES events.`
  );
}

main().catch(console.error);
