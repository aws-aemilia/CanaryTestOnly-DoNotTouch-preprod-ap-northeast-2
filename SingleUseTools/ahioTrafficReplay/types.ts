import { AmplifyAccount } from "../../Commons/Isengard";

export interface AhioTrafficReplayArgs {
  concurrentRequestsPerRegion: number;
  endDate: Date;
  outputDir: string;
  region?: string;
  stage: string;
  startDate: Date;
}

export interface HostingGatewayImageRequest {
  acceptHeader: string;
  activeJobId: string;
  appId: string;
  branchName: string;
  cacheContolHeader: string;
  contentDispositionHeader: string;
  contentLengthHeader: number;
  contentTypeHeader: string;
  etagHeader: string;
  nextCacheHeader: string;
  timeTakenMs: number;
  uri: string;
  varyHeader: string;
}

export interface HostingGatewayImageRequestRegionLogs {
  account: AmplifyAccount;
  logs: HostingGatewayImageRequest[];
}

export interface ImageRequestAhioRequestPair {
  imageRequest: HostingGatewayImageRequest;
  ahioRequest: AhioRequest;
}

export interface AhioResponse {
  statusCode: number;
  isBase64Encoded?: boolean;
  body?: string;
  headers?: Record<string, string>;
}

export interface RemotePattern {
  protocol?: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
}

export interface ImageSettings {
  sizes: number[];
  domains: string[];
  remotePatterns: RemotePattern[];
  formats: string[];
  minimumCacheTTL: number;
  dangerouslyAllowSVG: boolean;
}

export interface AhioRequest {
  schemaVersion: number;
  accountId: string;
  appId: string;
  branchName: string;
  activeJobId: string;
  presignedS3Url?: string;
  requestUrl: string;
  headers: Record<string, string>;
  imageSettings: ImageSettings;
}

export interface AhioInvocationResult {
  response: AhioResponse;
  log: string;
  timeTakenMs: number;
}

export enum ProblemType {
  MISSING_HEADERS = "MISSING_HEADERS",
  TIME = "TIME",
  SIZE = "SIZE",
  NON_200 = "NON_200",
}

export interface ProblemData {
  original: number;
  ahio: number;
}

export interface Problem {
  type: ProblemType;
  data?: ProblemData;
}

export interface SingleRegionResults {
  region: string;
  problemCount: number;
  successCount: number;
  allProblems: {
    problems: Problem[];
    imageRequest: HostingGatewayImageRequest;
    ahioRequest: Partial<AhioRequest>;
    ahioResult: Partial<AhioInvocationResult>;
  }[];
  allSuccesses: {
    imageRequest: HostingGatewayImageRequest;
    ahioRequest: Partial<AhioRequest>;
    ahioResult: Partial<AhioInvocationResult>;
  }[];
}
