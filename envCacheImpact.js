/*
 * IMPORTANT: This SCANS the branch DDB table. Do not run unless necessary
 */
const aws = require('aws-sdk');
const fs = require('fs');
// Not committed, get temporary credentials from isengard
// use readOnly user and paste the contents from JSON field into creds.json
const credsFile = require('./creds.json');

// Set region and stage
const region = 'ap-southeast-2';
const stage = 'prod';
// wait X ms between runs
const waitDuration = 5000;
// limit DDB to scan X items at a time
const scanLimit = 100;

const credentials = new aws.Credentials(credsFile.credentials);
const appTableName  = `${stage}-${region}-App`;
const branchTableName = `${stage}-${region}-Branch`;
const firstBuildId = '0000000001';
const secondBuildId = '0000000002';
const impactStartTimeStamp = new Date('2019-04-04T16:13').getTime();
const impactEndTimeStamp = new Date('2019-04-24T17:00').getTime();
const newStackIndicator = 'Initializing project in the cloud';
const ddbKeyFile = 'ddb_key';
const scanResultFile = 'scan_result';
const stackAppFile = 'stack_found_apps';
const stackAccountFile = 'stack_found_accounts';
const buildAppFile = 'build_found_apps';
const buildAccountFile = 'build_found_accounts';
const stackNameRegex = /CREATE_IN_PROGRESS\s(.*?)(\s*?)AWS::CloudFormation::Stack/;

let lastEvaluatedKey = undefined;

let stackImpactedAppIds = [];
let stackImpactedAccountIds = [];

let buildImpactedAppIds = [];
let buildImpactedAccountIds = [];

try {
  if (fs.existsSync(stackAppFile)) {
    const readApps = fs.readFileSync(stackAppFile);
    stackImpactedAppIds = JSON.parse(readApps);
  }
} catch (e) {
  // no apps yet
}
try {
  if (fs.existsSync(stackAccountFile)) {
    const readAccounts = fs.readFileSync(stackAccountFile);
    stackImpactedAccountIds = JSON.parse(readAccounts);
  }
} catch (e) {
  // no apps yet
}
try {
  if (fs.existsSync(buildAppFile)) {
    const readAccounts = fs.readFileSync(buildAppFile);
    buildImpactedAppIds = JSON.parse(readAccounts);
  }
} catch (e) {
  // no apps yet
}
try {
  if (fs.existsSync(buildAccountFile)) {
    const readAccounts = fs.readFileSync(buildAccountFile);
    buildImpactedAccountIds = JSON.parse(readAccounts);
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
        const storedInfo = fs.readFileSync(ddbKeyFile);
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
  const branches = unfilteredBranches.Items.filter((branch) => new Date(branch.createTime.S).getTime() >= impactStartTimeStamp && new Date(branch.createTime.S).getTime() < impactEndTimeStamp);

  // For each branch
  const branchPromises = branches.map(async (branch) => {
    const appId = branch.appId.S;

    const stacks = [];

    // Only proceed if this app is not in impacted list
    if (stackImpactedAppIds.indexOf(appId) < 0) {
      let builds = [];

      // Get code build builds
      let buildIds = await codebuild.listBuildsForProject({projectName: appId}).promise();
      let codebuildBuilds = await codebuild.batchGetBuilds({ids: buildIds['ids']}).promise();
      let token = buildIds.nextToken;

      builds = builds.concat(codebuildBuilds.builds);
      while (token) {
        let buildIds = await codebuild.listBuildsForProject({'projectName': appId, 'nextToken': token}).promise();
        let codebuildBuilds = await codebuild.batchGetBuilds({'ids': buildIds['ids']}).promise();
        builds = builds.concat(codebuildBuilds.builds);

        token = (token !== buildIds.nextToken) ? buildIds.nextToken : null;
      }

      // This filters the builds to the first build of the branch we're checking
      const filteredBuilds = builds
        .filter((build) => build.environment.environmentVariables.find(element => element.name === 'AWS_BRANCH').value === branch.branchName.S);
        // .find((build) => build.environment.environmentVariables.find(element => element.name === 'AWS_JOB_ID').value === firstBuildId);

      let firstBuildPass = false;
      let secondBuildPass = undefined;
      const jobPromises = filteredBuilds.map(async (build) => {
        const buildStatus = build.buildStatus;
        const jobId = build.environment.environmentVariables.find(element => element.name === 'AWS_JOB_ID').value;
        if (jobId === firstBuildId) {
          firstBuildPass = (buildStatus === 'SUCCEEDED');
        } else if (jobId === secondBuildId) {
          secondBuildPass = (buildStatus === 'SUCCEEDED');
        }
        // Get logs from Cloudwatch
        const logs = await cloudwatchlogs.getLogEvents({logGroupName: build.logs.groupName, logStreamName: build.logs.streamName}).promise();

        // Check for the log line that indicates this is a new stack
        let isNewStack = false;
        let stackFound = false;
        logs.events.forEach((log) => {
          if (log.message.indexOf(newStackIndicator) >= 0) {
            isNewStack = true;
          }
          const match = log.message.match(stackNameRegex);
          if (match && isNewStack && !stackFound) {
            stackFound = true;
            stacks.push(match[1]);
          }
        });
      });
      await Promise.all(jobPromises);

      if (firstBuildPass && secondBuildPass === false && buildImpactedAppIds.indexOf(appId) < 0) {
        buildImpactedAppIds.push(appId);
      }
      if (stacks.length > 1 && stackImpactedAppIds.indexOf(appId) < 0) {
        stackImpactedAppIds.push(appId);
      }
    }
  });

  // Wait for all branches to finish being checked
  await Promise.all(branchPromises);

  // For each impacted app, query DDB to get the account ID
  const stackImpactedAppPromises = stackImpactedAppIds.map(async (appId) => {
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
    if (appResult.Count > 0) {
      const accountId = appResult.Items[0].accountId.S;
      if (stackImpactedAccountIds.indexOf(accountId) < 0) {
        stackImpactedAccountIds.push(accountId);
      }
    }
  });

  await Promise.all(stackImpactedAppPromises);
  const buildImpactedAppPromises = buildImpactedAppIds.map(async (appId) => {
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
    if (appResult.Count > 0) {
      const accountId = appResult.Items[0].accountId.S;
      if (buildImpactedAccountIds.indexOf(accountId) < 0) {
        buildImpactedAccountIds.push(accountId);
      }
    }
  });

  await Promise.all(buildImpactedAppPromises);

  // Properly parsed results, removing file before re-run
  fs.unlinkSync(scanResultFile);

  if (lastEvaluatedKey) {
    console.log('not all branches scanned yet, saving results to file in case of crash and continuing scan');
    fs.writeFileSync(stackAccountFile, JSON.stringify(stackImpactedAccountIds));
    fs.writeFileSync(stackAppFile, JSON.stringify(stackImpactedAppIds));
    fs.writeFileSync(buildAppFile, JSON.stringify(buildImpactedAppIds));
    fs.writeFileSync(buildAccountFile, JSON.stringify(buildImpactedAccountIds));
    await setTimeout(async () => await main(true), waitDuration);
  } else {
    console.log('Run complete, removing files');
    if (fs.existsSync(stackAppFile)) {
      fs.unlinkSync(stackAppFile);
    }
    if (fs.existsSync(stackAccountFile)) {
      fs.unlinkSync(stackAccountFile);
    }
    if (fs.existsSync(buildAppFile)) {
      fs.unlinkSync(buildAppFile);
    }
    if (fs.existsSync(buildAccountFile)) {
      fs.unlinkSync(buildAccountFile);
    }
    if (fs.existsSync(ddbKeyFile)) {
      fs.unlinkSync(ddbKeyFile);
    }

    console.log('Results:');
    console.log('Region: ' + region);
    console.log('Stage: ' + stage);
    console.log('Number of stack impacted apps: ' + stackImpactedAppIds.length);
    console.log('Number of stack impacted accounts: ' + stackImpactedAccountIds.length);
    console.log(stackImpactedAccountIds);
    console.log('Number of build impacted apps: ' + buildImpactedAppIds.length);
    console.log('Number of build impacted accounts: ' + buildImpactedAccountIds.length);
    console.log(buildImpactedAccountIds);
    const output = {
      region,
      stage,
      stackImpactedAppIds,
      stackImpactedAccountIds,
      buildImpactedAppIds,
      buildImpactedAccountIds
    };

    const fileName = stage + '-' + region + '-impacted-accounts.json';
    fs.writeFileSync(fileName, JSON.stringify(output));
  }

}

main();
