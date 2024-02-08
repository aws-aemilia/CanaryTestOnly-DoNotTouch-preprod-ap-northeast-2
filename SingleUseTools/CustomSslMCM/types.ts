import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { RegionName } from "Commons/Isengard/types";

export interface TestCaseInput {
  credentials: Provider<AwsCredentialIdentity>;
  domainName: string;
  endpoint: string;
  regionName: RegionName;
}

export type TestCase = (testCaseInput: TestCaseInput) => Promise<void>;
