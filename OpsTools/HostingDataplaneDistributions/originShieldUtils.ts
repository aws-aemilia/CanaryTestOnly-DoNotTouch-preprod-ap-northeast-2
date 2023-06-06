import { Region } from "../../commons/Isengard";

export type OriginShieldMap = Partial<Record<Region, Region>>;

export const originShieldMap: OriginShieldMap = {
  "us-east-1": "us-east-1",
  "us-east-2": "us-east-2",
  "us-west-2": "us-west-2",
  "ap-south-1": "ap-south-1",
  "ap-northeast-2": "ap-northeast-2",
  "ap-southeast-1": "ap-southeast-1",
  "ap-southeast-2": "ap-southeast-2",
  "ap-northeast-1": "ap-northeast-1",
  "eu-central-1": "eu-central-1",
  "eu-west-1": "eu-west-1",
  "eu-west-2": "eu-west-2",
  "sa-east-1": "sa-east-1",

  // Special regions where OriginShield is deployed in a different region
  "us-west-1": "us-west-2",
  "af-south-1": "eu-west-1",
  "ap-east-1": "ap-southeast-1",
  "ca-central-1": "us-east-1",
  "eu-south-1": "eu-central-1",
  "eu-west-3": "eu-west-2",
  "eu-north-1": "eu-west-2",
  "me-south-1": "ap-south-1",
};
