# AWS Amplify Tools

This package contains ops tools for Amplify Console. The Node scripts are located inside the `node-scripts` folder and
the bash scripts under `scripts`.

## Installing dependencies

```bash
cd node-scripts
brazil ws --sync --md
brazil-build install
```

If the above fails due to a package being supposedly not found, on the `AWSAmplifyTools/development` version
set, [merge from live](https://build.amazon.com/merge#{%22destination%22:%22AWSAmplifyTools/development%22,%22options%22:{%22source%22:%22live%22,%22add%22:[]}})
, then retry the last two commands above.

## Running a Node script

```bash
node {script_name}.js
npx ts-node {script_name}.ts
```

## Use Prettier for code formatting

After running `brazil-build install` above, install your IDE's Prettier extension, and point it to this
project's `node_modules`. Or, run `npx prettier --write .` to reformat your script.


## Global Query Script

```
cd node-scripts/
npm run globalQuery -- \
--logGroupPrefix /aws/lambda/AemiliaControlPlaneLambda-AccountClosureProcessor- \
--stage prod \
--outputDir queryResults \
--startDate 2022-04-01T00:00:00 \
--endDate 2022-04-02T00:00:00 \
--query "fields @timestamp | filter @message like /assuming account event service facing fatal error, stop processing/ | stats count(*) by bin(1d)"
```

### Noisy reverse proxy script

```bash
brazil-build noisy-reverse-proxy -- \
--command=migrate \
--appId=d2x3jzd0euexdg \
--region=us-west-2 \
--stage=test \              # test, beta, gamma or prod
--dryrun                    # Remove to actually make changes
```

To rollback the changes to their original state

```bash
brazil-build noisy-reverse-proxy -- \
--command=rollback \
--appId=d2x3jzd0euexdg \
--region=us-west-2 \
--stage=test
```

To specify specific distributionIds instead of applying it on all distros

```bash
brazil-build noisy-reverse-proxy -- \
--command=migrate \
--appId=d2x3jzd0euexdg \
--region=us-west-2 \
--distributionId=E123456 \
--distributionId=E789123 \
--stage=test
```