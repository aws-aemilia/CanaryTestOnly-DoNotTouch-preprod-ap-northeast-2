import logger from "../../Commons/utils/logger";

import {
  AhioInvocationResult,
  HostingGatewayImageRequest,
  Problem,
  ProblemType,
} from "./types";

export function findProblemsWithAhioRequest(
  ahioInvocationResult: AhioInvocationResult,
  imageRequest: HostingGatewayImageRequest
): Problem[] {
  if (!ahioInvocationResult.response) {
    return [
      {
        type: ProblemType.FAILED_INVOCATION,
      },
    ];
  }
  // Ahio response times need to be within 10% of image request to be valid
  // Ahio response size needs to be within 5% of image request to be valid
  if (!ahioInvocationResult.response.headers) {
    return [
      {
        type: ProblemType.MISSING_HEADERS,
      },
    ];
  }

  if (ahioInvocationResult.response.statusCode !== 200) {
    return [
      {
        type: ProblemType.NON_200,
        data: {
          original: 200,
          ahio: ahioInvocationResult.response.statusCode,
        },
      },
    ];
  }

  const problems: Problem[] = [];
  if (
    ahioInvocationResult.response.headers["content-type"] !==
    imageRequest.contentTypeHeader
  ) {
    problems.push({
      type: ProblemType.MIME_TYPE_MISMATCH,
      data: {
        original: imageRequest.contentTypeHeader,
        ahio: ahioInvocationResult.response.headers["content-type"],
      },
    });
  }

  if (
    ahioInvocationResult.lambdaTimeTakenMs > 100 &&
    ahioInvocationResult.lambdaTimeTakenMs > imageRequest.timeTakenMs * 1.1
  ) {
    problems.push({
      type: ProblemType.TIME_FROM_LAMBDA,
      data: {
        original: imageRequest.timeTakenMs,
        ahio: ahioInvocationResult.lambdaTimeTakenMs,
      },
    });
  }

  if (
    ahioInvocationResult.response.headers["content-length"] &&
    imageRequest.contentLengthHeader
  ) {
    const ahioResponseSize = parseInt(
      ahioInvocationResult.response.headers["content-length"]
    );
    logger.trace(
      {
        ahioResponseSize,
        imageRequestContentLength: imageRequest.contentLengthHeader,
      },
      "Size check"
    );
    if (ahioResponseSize > imageRequest.contentLengthHeader * 1.05) {
      problems.push({
        type: ProblemType.SIZE,
        data: {
          original: imageRequest.contentLengthHeader,
          ahio: ahioResponseSize,
        },
      });
    }
  }

  return problems;
}
