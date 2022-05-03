#!/usr/bin/env bash
set -e

# This script sets the retention policy to 10 years on all CloudWatch
# Log Groups in an account. It loops through all Amplify regions and uses
# Isengard to fetch temporaary credentials with the OncallOperator role. 

# To invoke it pass the region airport code
# ./log_retention PDX

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Load all utility functions
source "$CURRENT_DIR/utils.sh"

RETENTIONINDAYS=3653 # 10 years
REGION_AIRPORT_CODE=$1 # Get region from args
IAM_ROLE=OncallOperator

echo "Running script for $REGION_AIRPORT_CODE"
amplify_account=$(get_amplify_account $REGION_AIRPORT_CODE)
isengard_login $amplify_account $IAM_ROLE
regionName=$(get_region_name $REGION_AIRPORT_CODE)
echo "Region name $regionName"
echo "Listing all log groups in the account"
lglist=$(aws logs describe-log-groups --region $regionName --output text --query 'logGroups[*].[logGroupName]')
while IFS= read -r lg; do
  echo "Configuring retention policy for $lg"
  sleep 1
  aws logs put-retention-policy \
      --region $regionName \
      --log-group-name $lg \
      --retention-in-days $RETENTIONINDAYS
done <<< "$lglist"
echo "Done"

echo "Unsetting credentials"
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
