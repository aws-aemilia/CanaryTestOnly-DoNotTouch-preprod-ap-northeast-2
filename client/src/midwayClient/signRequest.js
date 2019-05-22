import { AwsSigner } from 'aws-sign-web';


export default function (request, credentials, service) {
    // request.header object from axios is decorated with keys that are not headers.
    // This breaks our signing mechanism.
    // For now, we have no need for additional API Gateway headers.
    request.headers = {};

    // Sign with cached credentials if they exist,
    // the request may fail if credentials themselves are expired
    // If no cached credentials, return credential error
    return credentials.getPromise()
    .then(() => signRequest(request, credentials, service))
    .catch(error => ((credentials.secretAccessKey && credentials.accessKeyId) ?
        signRequest(request, credentials, service) :
        Promise.reject(error)));
}

function signRequest(request, credentials, service) {
    const headers = new AwsSigner({
        region: credentials.region,
        service,
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken,
    })
    .sign(request);

    Object.assign(request.headers, headers);
    return request;
}
