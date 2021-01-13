// const Redshift = require('node-redshift');
// const aws = require('aws-sdk');

// let client;

// async function setClient() {
//     const clusterId = 'amplify-business-metrics-prod'
//     const dbUser = 'awsuser'
//     const dbName = 'dev'
//     const params = {
//       ClusterIdentifier: clusterId,
//       DbUser: dbUser,
//       DbName: dbName
//     };

//     try {
//         const rs = new aws.Redshift()
//         const ret = await rs.getClusterCredentials(params).promise()
//         const connection = {
//             user: ret.DbUser,
//             database: dbName,
//             password: ret.DbPassword,
//             port: 5439,
//             host: clusterId + '.c2w5sisfl82n.us-west-2.redshift.amazonaws.com',
//             ssl: true
//         };
//         client = new Redshift(connection, {});
//     } catch(e) {
//         console.error('Error establishing connection: ', e)
//         throw new Error('Error establishing connection: ' + e)
//     }
// }

// const execute = (query) => new Promise(async (resolve, reject) => {
//     console.log('execute called')
//     if (!client) {
//         console.log('no client established yet, setting up client')
//         try {
//             await setClient();
//         } catch (e) {
//             console.error('Error setting Redshift client', e)
//             return reject({message: 'Error setting Redshift client', e});
//         }
//     }

//     client.query(query, {}, function (error, data) {
//         if (error) {
//             console.error('Error executing query', error)
//             return reject({message: 'Error executing query', error})
//         }
//         console.log('data: ', data)
//         return resolve(data);
//     })
// });

// module.exports = execute;
