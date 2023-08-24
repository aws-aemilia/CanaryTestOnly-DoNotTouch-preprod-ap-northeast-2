import { readLineAsync } from "./readline-async";

export async function validateResponseWithMessage({
  prompt,
  regex,
  errorMessage,
}: {
  prompt: string;
  regex: RegExp;
  errorMessage: string;
}): Promise<string> {
  let response;
  do {
    response = await readLineAsync(prompt);

    if (!response.match(regex)) {
      console.log(`\n\n${errorMessage}\n\n`);
      response = "";
    }
  } while (!response);
  return response;
}
