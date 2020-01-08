const Redshift = require('node-redshift');
const aws = require('aws-sdk');

let client;

async function setClient() {
    console.log("setClient called")
    const clusterId = 'amplify-business-metrics-prod'
    const dbUser = 'awsuser'
    const dbName = 'dev'
    const params = {
      ClusterIdentifier: clusterId,
      DbUser: dbUser,
      DbName: dbName
    };

    try {
        const rs = new aws.Redshift()
        const ret = await rs.getClusterCredentials(params).promise()
        const connection = {
            user: ret.DbUser,
            database: dbName,
            password: ret.DbPassword,
            port: 5439,
            host: clusterId + '.c2w5sisfl82n.us-west-2.redshift.amazonaws.com',
            ssl: true
        };
        console.log('setting client using connection options: ', connection)
        client = new Redshift(connection, {});
        console.log('redshift client now setup: ', client)
    } catch(err) {
        console.error('error: ', err)
        throw new Error('Error establishing connection: ' + err)

    }
    console.log('creds: ', ret)
}

const execute = (query) => new Promise(async (resolve, reject) => {
    console.log('execute called')
    if (!client) {
        console.log('no client established yet, setting up client')
        try {
            await setClient();
        } catch (error) {
            return reject({message: 'Error setting redshift client', error});
        }
    }
    console.log('calling query with client and query: ', client, query)
    // client.query(query, {})
    //     .then((data) => {
    //         console.log('query returned data: ', data)
    //         return resolve(data)
    //     })
    //     .catch(err => {
    //         console.error('Error executing query', err)
    //         return reject({message: 'Error executing query', err})
    //     })

    client.query(query, {}, function (error, data) { //PROBLEM IS HERE
        console.log('called client.query with client')
        if (error) {
            console.error('Error executing query', error)
            return reject({message: 'Error executing query', error})
        }
        console.log('data: ', data)
        return resolve(data);
    })
});

module.exports = execute;
