export const controlPlaneEndpoint = "https://cpapcsd1lf.execute-api.us-west-2.amazonaws.com/test";

const controlPlaneApiEndpoints = {
  "beta.us-west-2":
    "https://ntb76nklh1.execute-api.us-west-2.amazonaws.com/beta",

  "gamma.us-east-1":
    "https://l0c840snn2.execute-api.us-east-1.amazonaws.com/gamma",
  "gamma.us-west-2":
    "https://e3alza85jk.execute-api.us-west-2.amazonaws.com/gamma",

  "gamma.ap-east-1":
    "https://vq3cz2zxpe.execute-api.ap-east-1.amazonaws.com/preprod",
  "gamma.ap-northeast-1":
    "https://trlqfh78fk.execute-api.ap-northeast-1.amazonaws.com/preprod",
  "gamma.ap-northeast-2":
    "https://l8042ol6ue.execute-api.ap-northeast-2.amazonaws.com/preprod",
  "gamma.ap-south-1":
    "https://qxaos0w5gc.execute-api.ap-south-1.amazonaws.com/preprod",
  "gamma.ap-southeast-1":
    "https://64vcvrtk16.execute-api.ap-southeast-1.amazonaws.com/preprod",
  "gamma.ap-southeast-2":
    "https://wj8l06x1nc.execute-api.ap-southeast-2.amazonaws.com/preprod",
  "gamma.ca-central-1":
    "https://avzzlo5106.execute-api.ca-central-1.amazonaws.com/preprod",
  "gamma.eu-central-1":
    "https://oi3xa1yr2c.execute-api.eu-central-1.amazonaws.com/preprod",
  "gamma.eu-north-1":
    "https://022kfuda7c.execute-api.eu-north-1.amazonaws.com/preprod",
  "gamma.eu-south-1":
    "https://ybvp0t8mcl.execute-api.eu-south-1.amazonaws.com/preprod",
  "gamma.eu-west-1":
    "https://6h8evzsxth.execute-api.eu-west-1.amazonaws.com/preprod",
  "gamma.eu-west-2":
    "https://o9na931sp2.execute-api.eu-west-2.amazonaws.com/preprod",
  "gamma.eu-west-3":
    "https://a8mbtpp6wh.execute-api.eu-west-3.amazonaws.com/preprod",
  "gamma.me-south-1":
    "https://z57fnmpdie.execute-api.me-south-1.amazonaws.com/preprod",
  "gamma.sa-east-1":
    "https://kegoomvppf.execute-api.sa-east-1.amazonaws.com/preprod",
  "gamma.us-east-2":
    "https://gg9y8yidbk.execute-api.us-east-2.amazonaws.com/preprod",
  "gamma.us-west-1":
    "https://iztnaqjt30.execute-api.us-west-1.amazonaws.com/preprod",

  "preprod.ap-east-1":
    "https://vq3cz2zxpe.execute-api.ap-east-1.amazonaws.com/preprod",
  "preprod.ap-northeast-1":
    "https://trlqfh78fk.execute-api.ap-northeast-1.amazonaws.com/preprod",
  "preprod.ap-northeast-2":
    "https://l8042ol6ue.execute-api.ap-northeast-2.amazonaws.com/preprod",
  "preprod.ap-south-1":
    "https://qxaos0w5gc.execute-api.ap-south-1.amazonaws.com/preprod",
  "preprod.ap-southeast-1":
    "https://64vcvrtk16.execute-api.ap-southeast-1.amazonaws.com/preprod",
  "preprod.ap-southeast-2":
    "https://wj8l06x1nc.execute-api.ap-southeast-2.amazonaws.com/preprod",
  "preprod.ca-central-1":
    "https://avzzlo5106.execute-api.ca-central-1.amazonaws.com/preprod",
  "preprod.eu-central-1":
    "https://oi3xa1yr2c.execute-api.eu-central-1.amazonaws.com/preprod",
  "preprod.eu-north-1":
    "https://022kfuda7c.execute-api.eu-north-1.amazonaws.com/preprod",
  "preprod.eu-south-1":
    "https://ybvp0t8mcl.execute-api.eu-south-1.amazonaws.com/preprod",
  "preprod.eu-west-1":
    "https://6h8evzsxth.execute-api.eu-west-1.amazonaws.com/preprod",
  "preprod.eu-west-2":
    "https://o9na931sp2.execute-api.eu-west-2.amazonaws.com/preprod",
  "preprod.eu-west-3":
    "https://a8mbtpp6wh.execute-api.eu-west-3.amazonaws.com/preprod",
  "preprod.me-south-1":
    "https://z57fnmpdie.execute-api.me-south-1.amazonaws.com/preprod",
  "preprod.sa-east-1":
    "https://kegoomvppf.execute-api.sa-east-1.amazonaws.com/preprod",
  "preprod.us-east-1":
    "https://qm0xg3ajh3.execute-api.us-east-1.amazonaws.com/preprod",
  "preprod.us-east-2":
    "https://gg9y8yidbk.execute-api.us-east-2.amazonaws.com/preprod",
  "preprod.us-west-1":
    "https://iztnaqjt30.execute-api.us-west-1.amazonaws.com/preprod",
  "preprod.us-west-2":
    "https://h3xuo5w61e.execute-api.us-west-2.amazonaws.com/preprod",

  "prod.ap-east-1": "https://amplify.ap-east-1.amazonaws.com",
  "prod.ap-northeast-1": "https://amplify.ap-northeast-1.amazonaws.com",
  "prod.ap-northeast-2": "https://amplify.ap-northeast-2.amazonaws.com",
  "prod.ap-south-1": "https://amplify.ap-south-1.amazonaws.com",
  "prod.ap-southeast-1": "https://amplify.ap-southeast-1.amazonaws.com",
  "prod.ap-southeast-2": "https://amplify.ap-southeast-2.amazonaws.com",
  "prod.ca-central-1": "https://amplify.ca-central-1.amazonaws.com",
  "prod.eu-central-1": "https://amplify.eu-central-1.amazonaws.com",
  "prod.eu-north-1": "https://amplify.eu-north-1.amazonaws.com",
  "prod.eu-south-1": "https://amplify.eu-south-1.amazonaws.com",
  "prod.eu-west-1": "https://amplify.eu-west-1.amazonaws.com",
  "prod.eu-west-2": "https://amplify.eu-west-2.amazonaws.com",
  "prod.eu-west-3": "https://amplify.eu-west-3.amazonaws.com",
  "prod.me-south-1": "https://amplify.me-south-1.amazonaws.com",
  "prod.sa-east-1": "https://amplify.sa-east-1.amazonaws.com",
  "prod.us-east-1": "https://amplify.us-east-1.amazonaws.com",
  "prod.us-east-2": "https://amplify.us-east-2.amazonaws.com",
  "prod.us-west-1": "https://amplify.us-west-1.amazonaws.com",
  "prod.us-west-2": "https://amplify.us-west-2.amazonaws.com",
};

export function getControlPlaneApi(stage: string, region: string) {
  if (stage === "test") {
    return controlPlaneEndpoint;
  }

  return controlPlaneApiEndpoints[`${stage}.${region}`];
}
