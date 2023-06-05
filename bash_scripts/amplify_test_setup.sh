#!/bin/bash
set -e -o pipefail #terminate on first failure

# Constants
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Setup
echo -e "${GREEN}This tool will deploy a local version of the AWS Amplify Console service to your personal account${NC}"
echo -e "${GREEN}https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript${NC}"
echo -e "${YELLOW}Run this tool in the root folder that contains your workspaces!${NC}"
set -x #echo commands

# Deploy a local version of the AWS Amplify Console service
# See https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript
# TODO update the following values
ACCOUNT_ID="<AWS_ACCOUNT_ID>"
ISENGARD_ROLE="Administrator"
REGION="us-east-1"
USER_ALIAS="<YOUR_USERNAME>"
WARM_RESOURCE_COUNT="5"

# Set up control plane functional tests
echo -e "${GREEN}Configure control plane tests: BEGIN${NC}"
cd AemiliaControlPlaneLambda/src/AemiliaControlPlaneLambdaTests/src
sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" testng-development.xml
sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" testng-development.xml
sed -i "s/YOUR_USER_ALIAS_HERE/$(echo ${USER_ALIAS})/g" testng-development.xml
echo -e "${GREEN}Configure control plane tests: SUCCESS${NC}"
echo -e "${GREEN}Execute with: bb testng-run-development${NC}"
cd ../../../..

echo -e "${GREEN}ALL ITEMS COMPLETE. SCRIPT END.${NC}"