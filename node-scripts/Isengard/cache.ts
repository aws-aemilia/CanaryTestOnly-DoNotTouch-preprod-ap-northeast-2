import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";

export const withFileCache = <T extends Array<any>, U>(
  fn: (...args: T) => Promise<U>,
  filename: string
) => {
  return async (...args: T): Promise<U> => {
    const filePath = path.join(__dirname, "cache", `${filename}.json`);

    if (existsSync(filePath)) {
      console.log(`loading ${filePath}`);
      return JSON.parse(readFileSync(filePath, { encoding: "utf8" })) as U;
    }

    const output = await fn(...args);
    writeFileSync(filePath, JSON.stringify(output, null, 2));

    return output;
  };
};
