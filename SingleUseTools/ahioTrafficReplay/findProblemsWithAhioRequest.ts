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
  if (ahioInvocationResult.timeTakenMs > imageRequest.timeTakenMs * 1.1) {
    problems.push({
      type: ProblemType.TIME,
      data: {
        original: imageRequest.timeTakenMs,
        ahio: ahioInvocationResult.timeTakenMs,
      },
    });
  }

  if (
    ahioInvocationResult.response.headers["Content-Length"] &&
    imageRequest.contentLengthHeader
  ) {
    const ahioResponseSize = Number(
      ahioInvocationResult.response.headers["Content-Length"]
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
