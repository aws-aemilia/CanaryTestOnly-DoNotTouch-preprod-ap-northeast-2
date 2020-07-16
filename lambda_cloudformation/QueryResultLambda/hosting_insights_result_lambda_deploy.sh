#!/bin/bash
# sam build
# stack_name = "QueryResultLambda" + stage
# loop over regions
# region = "us-west-2"
# parameter_overrides = "Stage=\"beta\""
# sam deploy

echo "Runing scripts"
read -p "Stage: " STAGE
read -p "Region: " REGION

sed  -e "s/REGION_HERE/${REGION}/g" -e "s/STACK_NAME_HERE/${STAGE}-QueryResultLambda/g" -e "s/STAGE_OVERRIDE_HERE/Stage=${STAGE}/g" -e "s/S3_BUCKET_NAME_HERE/${STAGE}-${REGION}-hosting-insights-code/g" samconfig_template.toml > samconfig.toml
sam build
sam deploy