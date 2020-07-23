const aws = require('aws-sdk');
// Not committed, get temporary credentials from isengard
// use readOnly user and paste the contents from JSON field into creds.json
const credsFile = require('./creds.json');
const credentials = new aws.Credentials(credsFile.credentials);
aws.config.update({region: 'us-west-2', credentials});
const client = new aws.IAM();
const main = async () => {
    const resp = await client.createOpenIDConnectProvider({
        Url: 'https://midway-auth.amazon.com',
        ClientIDList: [
            'oncall-dev.console.amplify.aws.a2z.com'
        ],
        ThumbprintList: ['9e99a48a9960b14926bb7f3b02e22da2b0ab7280']
    }).promise();
    console.log(resp);
};

main();


