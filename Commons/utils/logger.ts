import pino from "pino";
import pinoPretty from "pino-pretty";
import { SpinningLogger } from "./spinningLogger";

export function createLogger(loggingLevel: string = "info") {
  return pino(
    {
      level: loggingLevel,
      safe: true,
    },
    pinoPretty({ sync: true })
  );
}

export function createSpinningLogger(
  loggingLevel: string = "info",
  spinnerText?: string
) {
  return new SpinningLogger(loggingLevel, spinnerText);
}

export default createLogger();
