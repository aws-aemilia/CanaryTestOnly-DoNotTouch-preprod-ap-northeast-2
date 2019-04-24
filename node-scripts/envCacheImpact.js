/*
 * IMPORTANT: This SCANS the branch DDB table. Do not run unless necessary
 */
const aws = require('aws-sdk');
const fs = require('fs');
// Not committed, get temporary credentials from isengard
// use readOnly user and paste the contents from JSON field into creds.json
const credsFile = require('./creds.json');

// Set region and stage
const region = 'us-west-2';
const stage = 'beta';
// wait X ms between runs
const waitDuration = 5000;
// limit DDB to scan X items at a time
const scanLimit = 50;

const credentials = new aws.Credentials(credsFile.credentials);
const appTableName  = `${stage}-${region}-App`;
const branchTableName = `${stage}-${region}-Branch`;
const firstBuildId = '0000000001';
const impactStartTimeStamp = new Date('2019-04-04T16:13').getTime();
const newStackIndicator = 'Initializing project in the cloud';
const ddbKeyFile = 'ddb_key';
const scanResultFile = 'scan_result';
const appFile = 'found_apps';
const accountFile = 'found_accounts';

let lastEvaluatedKey = undefined;

let impactedAppIds = [];
let impactedAccountIds = [];

try {
  if (fs.existsSync(appFile)) {
    const readApps = fs.readFileSync(appFile);
    impactedAppIds = JSON.parse(readApps);
  }
} catch (e) {
  // no apps yet
}
try {
  if (fs.existsSync(accountFile)) {
    const readAccounts = fs.readFileSync(accountFile);
    impactedAccountIds = JSON.parse(readAccounts);
  }
} catch (e) {
  // no apps yet
}

let ddb;
let codebuild;
let cloudwatchlogs;

async function main(rerun = false) {
  if (!rerun) {
    aws.config.update({region, credentials});
    ddb = new aws.DynamoDB();
    codebuild = new aws.CodeBuild();
    cloudwatchlogs = new aws.CloudWatchLogs();

    // Read existing key file
    try {
      if (fs.existsSync(ddbKeyFile)) {
        const storedInfo = fs.readFileSync(ddbKeyFile)
        lastEvaluatedKey = JSON.parse(storedInfo);
      }
    } catch (e) {
      // do nothing
    }
  }

  let unfilteredBranches = undefined;

  // If we find a scan result file, parsing the last result most likely crashed the script, so try again with those results
  if (fs.existsSync(scanResultFile)) {
    console.log('Stored result found. Not querying DDB');
    const storedResult = fs.readFileSync(scanResultFile);
    unfilteredBranches = JSON.parse(storedResult);
  } else {
    // Get all branches created in April with -Amplify in framework
    const params = {
      ExpressionAttributeValues: {
        ":date": {
          S: "2019-04-"
        },
        ":amplifyFramework": {
          S: '-Amplify'
        }
      },
      FilterExpression: "begins_with(createTime, :date) and contains(framework, :amplifyFramework)",
      TableName: branchTableName,
      Limit: scanLimit,
      ExclusiveStartKey: lastEvaluatedKey
    };
    unfilteredBranches = await ddb.scan(params).promise();

    // Writing scan result to file in case anything below errors we can re-use this file
    fs.writeFileSync(scanResultFile, JSON.stringify(unfilteredBranches));
  }

  lastEvaluatedKey = unfilteredBranches.LastEvaluatedKey;

  if (lastEvaluatedKey) {
    console.log('Branches remain, updating key file');
    fs.writeFileSync(ddbKeyFile, JSON.stringify(lastEvaluatedKey));
  }

  // Filter branches so only those created after impact remain
  const branches = unfilteredBranches.Items.filter((branch) => new Date(branch.createTime.S).getTime() >= impactStartTimeStamp);

  // For each branch
  const branchPromises = branches.map(async (branch) => {
    const appId = branch.appId.S;
    // Only proceed if this app is not in impacted list
    if (impactedAppIds.indexOf(appId) < 0) {
      let builds = [];

      // Get code build builds
      let buildIds = await codebuild.listBuildsForProject({projectName: appId}).promise();
      let codebuildBuilds = await codebuild.batchGetBuilds({ids: buildIds['ids']}).promise();
      let token = buildIds.nextToken;

      builds = builds.concat(codebuildBuilds.builds);
      while (token) {
        let buildIds = await codebuild.listBuildsForProject({'projectName': req.query['project'], 'nextToken': token}).promise();
        let codebuildBuilds = await codebuild.batchGetBuilds({'ids': buildIds['ids']}).promise();
        builds = builds.concat(codebuildBuilds.builds);

        token = (token !== buildIds.nextToken) ? buildIds.nextToken : null;
      }

      // This filters the builds to the first build of the branch we're checking
      const firstBuild = builds
        .filter((build) => build.environment.environmentVariables.find(element => element.name === 'AWS_BRANCH').value === branch.branchName.S)
        .find((build) => build.environment.environmentVariables.find(element => element.name === 'AWS_JOB_ID').value === firstBuildId);

      if (firstBuild) {
        // Get logs from Cloudwatch
        const logs = await cloudwatchlogs.getLogEvents({logGroupName: firstBuild.logs.groupName, logStreamName: firstBuild.logs.streamName}).promise();

        // Check for the log line that indicates this is a new stack
        const isNewStack = logs.events.find((log) => log.message.indexOf(newStackIndicator) >= 0);

        // If it is a new stack and this appId is not in impact list, add to impact list
        if (isNewStack && impactedAppIds.indexOf(appId) < 0) {
          impactedAppIds.push(appId);
        }
      }
    }
  });

  // Wait for all branches to finish being checked
  await Promise.all(branchPromises);

  // For each impacted app, query DDB to get the account ID
  const impactedAppPromises = impactedAppIds.map(async (appId) => {
    const appParams = {
      ExpressionAttributeValues: {
        ":app": {
          S: appId
        },
      },
      KeyConditionExpression: "appId = :app",
      TableName: appTableName
    };
    const appResult = await ddb.query(appParams).promise();
    const accountId = appResult.Items[0].accountId.S;
    if (impactedAccountIds.indexOf(accountId) < 0) {
      impactedAccountIds.push(accountId);
    }
  });

  await Promise.all(impactedAppPromises);

  // Properly parsed results, removing file before re-run
  fs.unlinkSync(scanResultFile);

  if (lastEvaluatedKey) {
    console.log('not all branches scanned yet, saving results to file in case of crash and continuing scan');
    fs.writeFileSync(accountFile, JSON.stringify(impactedAccountIds));
    fs.writeFileSync(appFile, JSON.stringify(impactedAppIds));
    await setTimeout(async () => await main(true), waitDuration);
  } else {
    console.log('Run complete, removing files');
    fs.unlinkSync(appFile);
    fs.unlinkSync(accountFile);
    fs.unlinkSync(ddbKeyFile);

    console.log('Results:');
    console.log('Region: ' + region);
    console.log('Stage: ' + stage);
    console.log('Number of impacted apps: ' + impactedAppIds.length);
    console.log('Number of impacted accounts: ' + impactedAccountIds.length);
    console.log(impactedAccountIds);
    let output = [];
    output.push('Region: ' + region);
    output.push('Stage: ' + stage);
    output.push('Number of impacted apps: ' + impactedAppIds.length);
    output.push('Number of impacted accounts: ' + impactedAccountIds.length);
    output = [
      ...output,
      ...impactedAccountIds
    ];

    const fileName = stage + '-' + region + '-impacted-accounts.txt';
    fs.writeFileSync(fileName, output.join('\n'));
  }

}

main();
