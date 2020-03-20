#!/bin/bash
set -e -o pipefail #terminate on first failure

# Constants
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# $1 = The message: "SAM deploy <service>: BEGIN"
# $2 = Workspace name:
# $3 = Package name: 
function deploy_local_package() {
    echo -e echo -e "${GREEN}SAM deploy $3: BEGIN${NC}"

    # Navigate into the directory to build
    cd "$2/src/$3"

    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy SUCCESS${NC}"l
    cd ../../..
}


# Setup
echo -e "${GREEN}Ref: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript${NC}"
echo -e "${YELLOW}This tool assumes you are in the root 'AMPLIFY' directory created by 'amplify_backend_packages_setup.sh'.${NC}"
echo -e "${YELLOW}If you haven't run that tool - run it first and cd into the 'AMPLIFY' directory.${NC}"
set -x #echo commands

##### Deployment order matters ##### -->  do the SAM (local) deployment
deploy_local_package "Deploy webhook processor: BEGIN" "AemiliaWebhookProcessorLambda" "AemiliaWebhookProcessorLambda"
deploy_local_package "Deploy dynamodb stream: BEGIN" "AemiliaDynamoDBStreamLambda" "AemiliaDynamoDBStreamLambda"
deploy_local_package "Deploy control plane: BEGIN" "AemiliaControlPlaneLambda" "AemiliaControlPlaneLambda"
deploy_local_package "Deploy workers lambda: BEGIN" "AemiliaWorkersLambda" "AemiliaWorkersLambda"
deploy_local_package "Deploy warming pool: BEGIN" "AemiliaWarmingPoolInfrastructure" "AemiliaWarmingPool"
#deploy_local_package "Deploy edge lambda: BEGIN" "AemiliaEdgeLambda" "AemiliaEdgeLambda" # Maybe one day 🙄
download_and_build_package "Deploy pioneer execute: BEGIN" "AWSMobilePioneerExecute" "AWSMobilePioneerExecute"

echo -e "${GREEN}ALL ITEMS COMPLETE. SCRIPT END.${NC}"