#!/usr/bin/env bash
set -e

# This script sets the retention policy to 10 years on all CloudWatch
# Log Groups in an account. It loops through all Amplify regions and uses
# Isengard to fetch temporaary credentials with the OncallOperator role. 

CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

# Load all utility functions
source "$CURRENT_DIR/utils.sh"

RETENTIONINDAYS=3653 # 10 years

# Get all regions (i.e. IAD, PDX, etc)
amplify_regions=$(get_amplify_regions)

echo "Looping through amplify regions $amplify_regions"
for REGION in $amplify_regions
do
  echo "Starting with account $REGION"
  amplify_account=$(get_amplify_account $REGION)
  isengard_login $amplify_account Admin
  regionName=$(get_region_name $REGION)
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
  echo "======================================="
done
