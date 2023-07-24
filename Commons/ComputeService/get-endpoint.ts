import { Stage, Region } from "../Isengard";

export const getComputeServiceEndpoint = (
  stage: Stage,
  region: Region
): string => {
  return endpoints[`${stage}-${region}`];
};

type ComputeServiceEndpoints = {
  [stageRegion: string]: string;
};

const endpoints: ComputeServiceEndpoints = {
  "beta-us-west-2":
    "https://vh01l6qqrh.execute-api.us-west-2.amazonaws.com/prod",
  "gamma-eu-north-1":
    "https://1pqz4gaun0.execute-api.eu-north-1.amazonaws.com/prod",
  "gamma-me-south-1":
    "https://hz9quskhf6.execute-api.me-south-1.amazonaws.com/prod",
  "gamma-ap-south-1":
    "https://uhqu2garmi.execute-api.ap-south-1.amazonaws.com/prod",
  "gamma-eu-west-3":
    "https://e3ihbmlbsi.execute-api.eu-west-3.amazonaws.com/prod",
  "gamma-us-east-2":
    "https://fdqni1otrj.execute-api.us-east-2.amazonaws.com/prod",
  "gamma-eu-west-1":
    "https://bb7fxl6fuc.execute-api.eu-west-1.amazonaws.com/prod",
  "gamma-eu-central-1":
    "https://tox69446pf.execute-api.eu-central-1.amazonaws.com/prod",
  "gamma-sa-east-1":
    "https://6uymnge22l.execute-api.sa-east-1.amazonaws.com/prod",
  "gamma-ap-east-1":
    "https://bumft16txg.execute-api.ap-east-1.amazonaws.com/prod",
  "gamma-us-east-1":
    "https://gqr94yxtsb.execute-api.us-east-1.amazonaws.com/prod",
  "gamma-ap-northeast-2":
    "https://puf3423sc3.execute-api.ap-northeast-2.amazonaws.com/prod",
  "gamma-eu-west-2":
    "https://dfuragfl81.execute-api.eu-west-2.amazonaws.com/prod",
  "gamma-eu-south-1":
    "https://7j7orv0hvf.execute-api.eu-south-1.amazonaws.com/prod",
  "gamma-ap-northeast-1":
    "https://bkvoapxsy4.execute-api.ap-northeast-1.amazonaws.com/prod",
  "gamma-us-west-2":
    "https://qs1djxjv22.execute-api.us-west-2.amazonaws.com/prod",
  "gamma-us-west-1":
    "https://tuvnqahmyi.execute-api.us-west-1.amazonaws.com/prod",
  "gamma-ap-southeast-1":
    "https://v5x5sbqwa8.execute-api.ap-southeast-1.amazonaws.com/prod",
  "gamma-ap-southeast-2":
    "https://ggthu9qleg.execute-api.ap-southeast-2.amazonaws.com/prod",
  "gamma-ca-central-1":
    "https://oqh2gwdgf7.execute-api.ca-central-1.amazonaws.com/prod",
  "prod-eu-north-1":
    "https://yvg2a0aykc.execute-api.eu-north-1.amazonaws.com/prod",
  "prod-me-south-1":
    "https://fkm6d4je1d.execute-api.me-south-1.amazonaws.com/prod",
  "prod-ap-south-1":
    "https://cexyph7j68.execute-api.ap-south-1.amazonaws.com/prod",
  "prod-eu-west-3":
    "https://mraxmhwowd.execute-api.eu-west-3.amazonaws.com/prod",
  "prod-us-east-2":
    "https://dsea9v17wl.execute-api.us-east-2.amazonaws.com/prod",
  "prod-eu-west-1":
    "https://qkngcc9if6.execute-api.eu-west-1.amazonaws.com/prod",
  "prod-eu-central-1":
    "https://wetdclp136.execute-api.eu-central-1.amazonaws.com/prod",
  "prod-sa-east-1":
    "https://ebxbyc58zl.execute-api.sa-east-1.amazonaws.com/prod",
  "prod-ap-east-1":
    "https://wxaz6wp8kd.execute-api.ap-east-1.amazonaws.com/prod",
  "prod-us-east-1":
    "https://o923v7fjdd.execute-api.us-east-1.amazonaws.com/prod",
  "prod-ap-northeast-2":
    "https://n4uxlgennb.execute-api.ap-northeast-2.amazonaws.com/prod",
  "prod-eu-west-2":
    "https://zim6cgkd33.execute-api.eu-west-2.amazonaws.com/prod",
  "prod-eu-south-1":
    "https://gv6slx8i1h.execute-api.eu-south-1.amazonaws.com/prod",
  "prod-ap-northeast-1":
    "https://6e843jes55.execute-api.ap-northeast-1.amazonaws.com/prod",
  "prod-us-west-2":
    "https://fdw3fvdfgh.execute-api.us-west-2.amazonaws.com/prod",
  "prod-us-west-1":
    "https://cb616ra5o1.execute-api.us-west-1.amazonaws.com/prod",
  "prod-ap-southeast-1":
    "https://m7k6ral7kk.execute-api.ap-southeast-1.amazonaws.com/prod",
  "prod-ap-southeast-2":
    "https://x16ft6b713.execute-api.ap-southeast-2.amazonaws.com/prod",
  "prod-ca-central-1":
    "https://b15bi1jaqa.execute-api.ca-central-1.amazonaws.com/prod",
};
