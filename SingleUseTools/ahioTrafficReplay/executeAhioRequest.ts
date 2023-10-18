import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { AhioInvocationResult, AhioRequest, AhioResponse } from "./types";
import { TextDecoder } from "node:util";
import logger from "Commons/utils/logger";
import sleep from "Commons/utils/sleep";

const AHIO_FUNCTION_NAME = "AmplifyHostingImageOptimizer";

export async function executeAhioRequest(
  ahioRequest: AhioRequest,
  lambdaClient: LambdaClient
): Promise<AhioInvocationResult> {
  const invokeCommand = new InvokeCommand({
    FunctionName: AHIO_FUNCTION_NAME,
    Payload: JSON.stringify(ahioRequest),
    LogType: "Tail",
  });

  let attempts = 0;
  let response;
  let timeTakenMs;
  while(!response && attempts < 10) {
    attempts++;
    try {
      const startTime = new Date();
      response = await lambdaClient.send(invokeCommand);
      timeTakenMs = new Date().getTime() - startTime.getTime();
    } catch(error) {
      logger.error(error, `Failed while invoking ahio, retrying. Attempt: ${attempts}`);
      await sleep(200);
    }
  }

  if(!response || !timeTakenMs) {
    return {
      log: "FAILED TO INVOKE",
      timeTakenMs: Infinity,
      lambdaTimeTakenMs: Infinity,
    };
  }

  let lambdaTimeTakenMs = -1;

  const responsePayloadString = new TextDecoder().decode(response.Payload);
  const parseBody = JSON.parse(responsePayloadString) as AhioResponse;

  const log = response.LogResult
    ? Buffer.from(response.LogResult, "base64").toString("ascii")
    : "";
  if (log && log.includes("Billed Duration: ")) {
    const matches = /Billed Duration: ([0-9]+) ms/.exec(log);
    if (matches && matches.length >= 1) {
      lambdaTimeTakenMs = parseInt(matches[1]);
    }
  }

  return {
    log,
    timeTakenMs,
    lambdaTimeTakenMs,
    response: parseBody,
  };
}
