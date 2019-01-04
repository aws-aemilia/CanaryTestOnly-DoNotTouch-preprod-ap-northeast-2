const Redshift = require('node-redshift');

module.exports = {
    name: 'awsamplify-tools',
    hostname : 'http://localhost',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3001,
    db: {
        get : function () {
            const client = {
                user: 'awsuser',
                database: 'dev',
                password: 'EGseffGSsdfD1',
                port: 5439,
                host: 'amplify-business-metrics-prod.c2w5sisfl82n.us-west-2.redshift.amazonaws.com'
            };

            return new Redshift(client, {});
		}
    }
}
