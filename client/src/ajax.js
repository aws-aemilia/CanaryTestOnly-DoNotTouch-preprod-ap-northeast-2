import MidwayIdentityJavaScriptClient from './midwayClient/client';

const config = {
    region: "us-west-2",
    cognitoIdentityPoolId: "us-west-2:32b52604-c1b2-4a1a-b3d0-81b06a789b4c"
};

class MidwayClient {
    client;

    constructor(httpEndpoint, cognitoIdentityPoolId, region) {
        this.client = new MidwayIdentityJavaScriptClient({httpEndpoint, cognitoIdentityPoolId, region});
    }

    async fetch(path, options) {
        return this.client.request(path, options);
    }


    post(path, options) {
        return this.client.post(path, options)
    }
}

let ajax;
const getAjax = () => {
    if (!ajax) {
        ajax = new MidwayClient('https://ex012oiylc.execute-api.us-west-2.amazonaws.com/latest', config.cognitoIdentityPoolId, config.region)
    }
    return ajax;
};

export default getAjax;
