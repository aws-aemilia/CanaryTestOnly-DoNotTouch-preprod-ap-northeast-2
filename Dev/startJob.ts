import { Amplify, JobType } from '@aws-sdk/client-amplify';
import { createSpinningLogger } from '../Commons/utils/logger';
import yargs from 'yargs';

async function main () {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Start a job on an app.

        Usage:
          npx ts-node startJob.ts \
            --amplifyEndpoint=https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/test \
            --amplifyRegion=us-west-2 \
            --appId=dxxxxx \
            --branchName=main

        OR

        Set environment variables to make it easier to rerun:

            export ENDPOINT=https://xxxxxxxxxx.execute-api.us-west-2.amazonaws.com/test
            export REGION=us-west-2
            export APP_ID=dxxxxx
            export BRANCH_NAME=main
            npx ts-node startJob.ts
        `,
    )
    .option('amplifyEndpoint', {
      describe: 'Endpoint for amplify control plane. Defaults to: process.env.ENDPOINT',
      type: 'string',
      default: process.env.ENDPOINT,
    })
    .option('amplifyRegion', {
      describe: 'Region for amplify control plane. Defaults to: process.env.REGION',
      type: 'string',
      default: process.env.REGION,
    })
    .option('appId', {
      describe: 'App id to start a job on. Defaults to: process.env.APP_ID',
      type: 'string',
      default: process.env.APP_ID,
    })
    .option('branchName', {
      describe: 'Branch name to start a job on. Defaults to: process.env.BRANCH_NAME',
      type: 'string',
      default: process.env.BRANCH_NAME,
    })
    .strict()
    .version(false)
    .help().argv;

  const { amplifyEndpoint, amplifyRegion, appId, branchName } = args;

  const amplify = new Amplify({
    endpoint: amplifyEndpoint,
    region: amplifyRegion,
  });

  const logger = createSpinningLogger();
  logger.spinnerStart();
  logger.info(`Starting job for appId: ${appId} and branchName: ${branchName}`);

  const startJobResult = await amplify.startJob({
    appId,
    branchName,
    jobType: JobType.RELEASE,
  });

  logger.info(`Job created. JobId: ${startJobResult.jobSummary?.jobId}`);

  while (true) {
    const getJobResult = await amplify.getJob({
      appId,
      branchName,
      jobId: startJobResult.jobSummary?.jobId,
    });

    logger.update(`Job status: ${getJobResult.job?.summary?.status}`);

    if (
      getJobResult.job?.summary?.status === 'COMPLETED' ||
      getJobResult.job?.summary?.status === 'FAILED' ||
      getJobResult.job?.summary?.status === 'CANCELED'
    ) {
      logger.spinnerStop(`Job hit terminal status: ${getJobResult.job?.summary?.status}`);
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  logger.info('Done!');
}

main().then(console.log).catch(console.error);
