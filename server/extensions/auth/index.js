const axios = require('axios');

const authUser = (req, res) => {
    console.log(Object.keys(req.headers));
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    axios({
        host: 'ja1jnixj5j.execute-api.us-west-2.amazonaws.com',
        path: '/beta/',
        url: 'https://ja1jnixj5j.execute-api.us-west-2.amazonaws.com/beta/',
        // headers: req.headers,
        method: 'GET',
        withCredentials: true
    })
        .then((resp) => res.send('yay'))
        .catch((err) => res.status(403).send(JSON.stringify('error: ' + err.message)));
};

module.exports = authUser;
