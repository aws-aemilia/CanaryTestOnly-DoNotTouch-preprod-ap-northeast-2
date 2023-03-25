import pino, { Level } from "pino";
import pinoPretty from "pino-pretty";

export function createLogger(loggingLevel: string = "info") {
  return pino(
    {
      level: loggingLevel,
      safe: true,
    },
    pinoPretty({ sync: true })
  );
}
