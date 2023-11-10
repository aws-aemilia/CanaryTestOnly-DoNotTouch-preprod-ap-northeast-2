import dayjs from "dayjs";

export function getLastNDates(n: number): [string, string][] {
  const dates: [string, string][] = [];
  const today = dayjs();
  for (let i = 0; i < n; i++) {
    dates.push([
      today.subtract(i + 1, "day").toISOString(),
      today.subtract(i, "day").toISOString(),
    ]);
  }
  return dates;
}
