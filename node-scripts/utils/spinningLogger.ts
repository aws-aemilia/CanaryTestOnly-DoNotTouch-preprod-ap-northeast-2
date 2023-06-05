import { BaseLogger, Logger } from 'pino';
import { createSpinner, Spinner } from 'nanospinner';
import { createLogger } from '../utils/logger';

export class SpinningLogger implements BaseLogger {
  level: string;
  logger: Logger;
  spinner: Spinner;
  #debounceTimer: NodeJS.Timeout | undefined;
  #isSpinning: boolean = false;

  constructor(level?: string, spinnerText?: string) {
    this.logger = createLogger(level);
    this.spinner = createSpinner(spinnerText, {
      stream: process.stdout,
    });
    this.level = this.logger.level;
  }

  // Spinner Methods
  spinnerStart() {
    this.spinner.start();
    this.#isSpinning = true;
  }

  spinnerStop(message: string, isSuccess: boolean = true) {
    if (isSuccess) {
      this.spinner.success({ text: message });
    } else {
      this.spinner.error({ text: message });
    }
    this.#isSpinning = false;
  }

  #spinnerClear() {
    this.spinner.clear();
  }

  update(spinnerText: string) {
    this.spinner.update({ text: spinnerText });
    return this;
  }

  // Logger methods
  fatal(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.fatal(obj, msg, ...args));
  }
  error(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.error(obj, msg, ...args));
  }
  warn(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.warn(obj, msg, ...args));
  }
  info(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.info(obj, msg, ...args));
  }
  debug(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.debug(obj, msg, ...args));
  }
  trace(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.trace(obj, msg, ...args));
  }
  silent(obj: any, msg?: string | undefined, ...args: any[]) {
    this.#logIt(() => this.logger.silent(obj, msg, ...args));
  }

  #logIt(loggerFunc: Function) {
    if (this.#isSpinning) {
      this.#spinnerClear();
      loggerFunc();
    } else {
      loggerFunc();
    }
  }
}
