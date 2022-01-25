# AWS Amplify Tools

This package contains ops tools for Amplify Console. The Node scripts are located inside the `node-scripts` folder and the bash scripts under `scripts`. 

## Running a Node script

First, install dependencies 

```bash
cd node-scripts
brazil-build install
```

Then run the desired script

```bash
node {script_name}.js
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