import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { AhioInvocationResult, AhioRequest, AhioResponse } from "./types";
import { TextDecoder } from "node:util";

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

  const startTime = new Date();
  const response = await lambdaClient.send(invokeCommand);
  const timeTakenMs = new Date().getTime() - startTime.getTime();

  const responsePayloadString = new TextDecoder().decode(response.Payload);
  const parseBody = JSON.parse(responsePayloadString) as AhioResponse;

  return {
    log: response.LogResult || "",
    timeTakenMs,
    response: parseBody,
  };
}
