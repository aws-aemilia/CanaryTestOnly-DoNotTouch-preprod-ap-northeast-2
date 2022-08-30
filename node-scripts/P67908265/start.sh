#!/bin/bash

nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=us-east-1 > ./P67908265/logs/us-east-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=us-east-2 > ./P67908265/logs/us-east-2.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=us-west-1 > ./P67908265/logs/us-west-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=us-west-2 > ./P67908265/logs/us-west-2.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-southeast-1 > ./P67908265/logs/ap-southeast-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-southeast-2 > ./P67908265/logs/ap-southeast-2.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-northeast-1 > ./P67908265/logs/ap-northeast-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-northeast-2 > ./P67908265/logs/ap-northeast-2.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-south-1 > ./P67908265/logs/ap-south-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ca-central-1 > ./P67908265/logs/ca-central-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-central-1 > ./P67908265/logs/eu-central-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-west-1 > ./P67908265/logs/eu-west-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-west-2 > ./P67908265/logs/eu-west-2.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=ap-east-1 > ./P67908265/logs/ap-east-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=sa-east-1 > ./P67908265/logs/sa-east-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=me-south-1 > ./P67908265/logs/me-south-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-north-1 > ./P67908265/logs/eu-north-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-south-1 > ./P67908265/logs/eu-south-1.log 2>&1 < /dev/null & disown
nohup ./node_modules/.bin/ts-node P67908265/validateHostingBillingImpact.ts --region=eu-west-3 > ./P67908265/logs/eu-west-3.log 2>&1 < /dev/null & disown
