const aws = require('aws-sdk');
const {getAccountId} = require('../accounts');

const roles = [
  // beta pdx
  'arn:aws:iam::033345365959:role/AemiliaWebhookProcessorLambda-OncallToolRole-15AWHWLYKMIO5',
  // gamma iad
  'arn:aws:iam::396176200477:role/AemiliaWebhookProcessorLambda-OncallToolRole-1487X5ZOC3VVH',
  // gamma pdx
  'arn:aws:iam::457974620857:role/AemiliaWebhookProcessorLambda-OncallToolRole-1IEQC6QM7IYRC',
  // lhr
  'arn:aws:iam::499901155257:role/AemiliaWebhookProcessorLambda-OncallToolRole-1GB3416EK5HCX',
  // cmh
  'arn:aws:iam::264748200621:role/AemiliaWebhookProcessorLambda-OncallToolRole-1DSXS8B0Z1BRJ',
  // sin
  'arn:aws:iam::148414518837:role/AemiliaWebhookProcessorLambda-OncallToolRole-1O5HIR58ZEV80',
  // dub
  'arn:aws:iam::565036926641:role/AemiliaWebhookProcessorLambda-OncallToolRole-13E45TA0HVI9N',
  // iad
  'arn:aws:iam::073653171576:role/AemiliaWebhookProcessorLambda-OncallToolRole-1L173QA8V5GF1',
  // nrt
  'arn:aws:iam::550167628141:role/AemiliaWebhookProcessorLambda-OncallToolRole-R7190LUEWPIA',
  // icn
  'arn:aws:iam::024873182396:role/AemiliaWebhookProcessorLambda-OncallToolRole-CXXNH6B0WHAC',
  // bom
  'arn:aws:iam::801187164913:role/AemiliaWebhookProcessorLambda-OncallToolRole-16XBLFT0C82GM',
  // syd
  'arn:aws:iam::711974673587:role/AemiliaWebhookProcessorLambda-OncallToolRole-1V8C9UT5VE6P8',
  // fra
  'arn:aws:iam::644397351177:role/AemiliaWebhookProcessorLambda-OncallToolRole-1DE1CTTIGOVXV',
  // pdx
  'arn:aws:iam::395333095307:role/AemiliaWebhookProcessorLambda-OncallToolRole-XBZ1N5AQJ09M'
];
let stsClient;
const getStsClient = () => {
    if (!stsClient) {
        stsClient = new aws.STS();
    }
    return stsClient;
};
const patchSdk = async (stage, region, sdk) => {
    const client = getStsClient();
    const accountId = getAccountId(stage, region);
    const RoleArn = roles.find((role) => role.indexOf(accountId) >= 0);
    if (!RoleArn) {
      throw new Error('role not found');
    }
    const params = {
        RoleArn,
        RoleSessionName: 'TOOLS',
        // DurationSeconds: 'NUMBER_VALUE'
    };
    try {
      const data = await client.assumeRole(params).promise();
      console.log('successfully assumed role');
      return new sdk({
        accessKeyId: data.Credentials.AccessKeyId,
        secretAccessKey: data.Credentials.SecretAccessKey,
        sessionToken: data.Credentials.SessionToken,
      });
    } catch (e) {
        console.log(e);
        throw new Error(e);
    }
};

module.exports = patchSdk;
