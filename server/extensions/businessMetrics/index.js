const Redshift = require('node-redshift');
const aws = require('aws-sdk');

let client;

async function setClient() {
    // const params = {
    //   ClusterIdentifier: 'amplify-business-metrics-prod', /* required */
    //   DbUser: 'awsuser', /* required */
    // };
    // const credentials = await new aws.Redshift().getClusterCredentials(params).promise();
    const creds = {
        user: 'awsuser',
        database: 'dev',
        password: 'EGseffGSsdfD1',
        port: 5439,
        host: 'amplify-business-metrics-prod.c2w5sisfl82n.us-west-2.redshift.amazonaws.com'
    };
    // console.log(creds);
    client = new Redshift(creds, {});
}

const execute = (query) => new Promise(async (resolve, reject) => {
    if (!client) {
        try {
            await setClient();
        } catch (error) {
            return reject({message: 'Error setting redshift client', error});
        }
    }
    client.query(query, {}, function (error, data) {
        if (error) {
            return reject({message: 'Error executing query', error})
        }
        return resolve(data);
    })
});
module.exports = execute;
