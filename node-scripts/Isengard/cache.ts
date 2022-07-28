import path from "path";
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";

export const withFileCache = <T extends Array<any>, U>(
  filename: string,
  fn: (...args: T) => Promise<U>,
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

export const deleteCache = async(filename: string) => {
  const filePath = path.join(__dirname, "cache", `${filename}.json`);
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}
