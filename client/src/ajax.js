import MidwayIdentityJavaScriptClient from './midwayClient/client';

const config = {
    region: "us-west-2",
    cognitoIdentityPoolId: "us-west-2:2514e49c-af4b-4642-8ce0-4736e6a4a3bb"
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
        ajax = new MidwayClient(
            process.env.REACT_APP_API_ENDPOINT ? process.env.REACT_APP_API_ENDPOINT : 'https://h4jqs1gatl.execute-api.us-west-2.amazonaws.com/latest',
            config.cognitoIdentityPoolId,
            config.region
        )
    }
    return ajax;
};

export default getAjax;
