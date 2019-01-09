#!/bin/bash
set -e -o pipefail #terminate on first failure

# Deploy a local version of the AWS Amplify Console service
# See https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript
# TODO update the following values
ACCOUNT_ID="<AWS_ACCOUNT_ID>"
ISENGARD_ROLE="Administrator"
REGION="us-east-1"
USER_ALIAS="<YOUR_USERNAME>"
WARM_RESOURCE_COUNT="5"

function deploy_webhook() {
    # Deploy webhook processor
    echo -e "${GREEN}Deploy webhook processor: BEGIN${NC}"
    if [[ ! -d "AemiliaWebhookProcessorLambda/src/AemiliaWebhookProcessorLambda" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaWebhookProcessorLambda" -vs "AemiliaWebhookProcessorLambda/development"
        cd AemiliaWebhookProcessorLambda
        brazil ws --use -p AemiliaWebhookProcessorLambda
        cd src/AemiliaWebhookProcessorLambda
    else
        cd AemiliaWebhookProcessorLambda/src/AemiliaWebhookProcessorLambda
    fi

    brazil ws --sync
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy webhook processor: SUCCESS${NC}"
    cd ../../..
}

function deploy_dynamodb_stream() {
    # Deploy dynamodb stream
    echo -e "${GREEN}Deploy dynamodb stream: BEGIN${NC}"
    if [[ ! -d "AemiliaDynamoDBStreamLambda/src/AemiliaDynamoDBStreamLambda" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaDynamoDBStreamLambda" -vs "AemiliaDynamoDBStreamLambda/development"
        cd AemiliaDynamoDBStreamLambda
        brazil ws --use -p AemiliaDynamoDBStreamLambda
        cd src/AemiliaDynamoDBStreamLambda
    else
        cd AemiliaDynamoDBStreamLambda/src/AemiliaDynamoDBStreamLambda
    fi

    brazil ws --sync --md
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy dynamodb stream: SUCCESS${NC}"
    cd ../../..
}

function deploy_control_plane() {
    # Deploy control plane
    echo -e "${GREEN}Deploy control plane: BEGIN${NC}"
    if [[ ! -d "AemiliaControlPlaneLambda/src/AemiliaControlPlaneLambda" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaControlPlaneLambda" -vs "AemiliaControlPlaneLambda/development"
        cd AemiliaControlPlaneLambda
        brazil ws --use -p AemiliaControlPlaneLambda
        cd src/AemiliaControlPlaneLambda
    else
        cd AemiliaControlPlaneLambda/src/AemiliaControlPlaneLambda
    fi

    brazil ws --sync --md
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy control plane: SUCCESS${NC}"
    cd ../../..
}

function deploy_workers_lambda() {
    # Deploy workers lambda
    echo -e "${GREEN}Deploy workers lambda: BEGIN${NC}"
    if [[ ! -d "AemiliaWorkersLambda/src/AemiliaWorkersLambda" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaWorkersLambda" -vs "AemiliaWorkersLambda/development"
        cd AemiliaWorkersLambda
        brazil ws --use -p AemiliaWorkersLambda
        cd src/AemiliaWorkersLambda
    else
        cd AemiliaWorkersLambda/src/AemiliaWorkersLambda
    fi

    brazil ws --sync --md
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy workers lambda: SUCCESS${NC}"
    cd ../../..
}

function deploy_edge_lambda() {
    # Deploy edge lambda
    echo -e "${GREEN}Deploy edge lambda: BEGIN${NC}"
    if [[ ! -d "AemiliaEdgeLambda/src/AemiliaEdgeLambda" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaEdgeLambda" -vs "AemiliaEdgeLambda/development"
        cd AemiliaEdgeLambda
        brazil ws --use -p AemiliaEdgeLambda
        cd src/AemiliaEdgeLambda
    else
        cd AemiliaEdgeLambda/src/AemiliaEdgeLambda
    fi

    brazil ws --sync --md
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy edge lambda: SUCCESS${NC}"
    cd ../../..
}

function deploy_warming_pool() {
    # Deploy warming pool
    echo -e "${GREEN}Deploy warming pool: BEGIN${NC}"
    if [[ ! -d "AemiliaWarmingPoolInfrastructure/src/AemiliaWarmingPool" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n "AemiliaWarmingPoolInfrastructure" -vs "AemiliaWarmingPoolInfrastructure/development"
        cd AemiliaWarmingPoolInfrastructure
        brazil ws --use -p AemiliaWarmingPool
        cd src/AemiliaWarmingPool
    else
        cd AemiliaWarmingPoolInfrastructure/src/AemiliaWarmingPool
    fi

    brazil ws --sync --md
    brazil-recursive-cmd "brazil-build"
    sed -i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed -i "s/YOUR_ROLE_NAME_HERE/$(echo ${ISENGARD_ROLE})/g" SAMToolkit.devenv
    sed -i "s/YOUR_REGION_HERE/$(echo ${REGION})/g" SAMToolkit.devenv
    sed -i "s/YOUR_WARM_RESOURCE_COUNT_HERE/$(echo ${WARM_RESOURCE_COUNT})/g" SAMToolkit.devenv
    brazil-build-tool-exec sam package
    brazil-build-tool-exec sam deploy
    echo -e "${GREEN}Deploy warming pool: SUCCESS${NC}"
    cd ../../..
}

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

# Deployment order matters
deploy_webhook
deploy_dynamodb_stream
deploy_control_plane
deploy_workers_lambda
deploy_edge_lambda
deploy_warming_pool

echo -e "${GREEN}ALL ITEMS COMPLETE. SCRIPT END.${NC}"