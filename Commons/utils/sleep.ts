import { randomInt } from "node:crypto";

const sleep = (durationMillis: number) =>
  new Promise((res) => setTimeout(res, durationMillis));

export default sleep;

/**
 *  Sleep for a period of time between the provided min and max
 *
 * @param {number} minDelayMillis - Minimum amount to wait
 * @param {number} maxDelayMillis - Maximum amount tot wait
 */
export async function sleepWithJitter(
  minDelayMillis: number,
  maxDelayMillis: number
) {
  const delayWithJitter = randomInt(minDelayMillis, maxDelayMillis);
  await sleep(delayWithJitter);
}
