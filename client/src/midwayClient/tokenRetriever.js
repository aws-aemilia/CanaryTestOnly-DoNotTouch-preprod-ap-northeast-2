export default class TokenRetriever {
    static getTokenOrRedirect() {
        return new Promise((resolve) => {
            const xhr = new XMLHttpRequest();
            xhr.withCredentials = true;
            xhr.open('GET', buildSSOUrl());
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(xhr.responseText);
                } else {
                    window.location.href = buildRedirectUrl();
                }
            };
            xhr.send();
        });
    }
}

function buildRedirectUrl() {
    const queryParams = {
        client_id: encodeURIComponent(window.location.host),
        redirect_uri: encodeURIComponent(window.location.href),
        response_type: 'id_token',
        scope: 'openid',
        nonce: generateNonce(),

    };

    return `https://midway-auth.amazon.com/login?next=/SSO/redirect${encodeURIComponent(buildQuery(queryParams))}`;
}

function buildSSOUrl() {
    const queryParams = {
        response_type: 'id_token',
        client_id: encodeURIComponent(window.location.host),
        redirect_uri: encodeURIComponent(window.location.href),
        scope: 'openid',
        nonce: generateNonce(),
    };

    return `https://midway-auth.amazon.com/SSO${buildQuery(queryParams)}`;
}

function buildQuery(parameters) {
    return Object.keys(parameters).reduce((accumulator, key) => `${accumulator + key}=${parameters[key]}&`, '?');
}

function generateNonce() {
    let nonce = '';
    const characterSet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 64; i += 1) {
        nonce += characterSet.charAt(Math.floor(Math.random() * characterSet.length));
    }
    return nonce;
}
