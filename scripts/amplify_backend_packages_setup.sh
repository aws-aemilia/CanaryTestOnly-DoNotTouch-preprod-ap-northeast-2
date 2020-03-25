#!/bin/bash
set -e -o pipefail #terminate on first failure

# Constants
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Deploy a local version of the AWS Amplify Console service
# See https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript
# TODO update the following values
ACCOUNT_ID="YOUR_ACCOUNT_ID_HERE" # e.g. 123456789123
USER_ALIAS="YOUR_ALIAS_HERE" # e.g. bradruof - not sure what is your alias?  Check https://phonetool.amazon.com/ --- (redirects to) ---> https://phonetool.amazon.com/users/<YOUR_ALIAS_HERE>
RAINBOW_MODE="no" # Wonder what happens if you change this to 'yes'... 🌈.

IS_MAC=''  # empty-string means this is a non-Mac (assume Linux)
if [ "$(uname)" == "Darwin" ]; then
    echo "We detected you are running on a MAC"
    IS_MAC='1'
fi

# https://ed.gs/2016/01/26/os-x-sed-invalid-command-code/
# Mac OS X and Linux usually have different versions of sed installed.
# This forks the command based on the current platform.
function sed_dash_i() {
    if [ "$IS_MAC" = '1' ]; then
        echo 'Mac sed -i'
        sed -i "" "$@"
    else
        echo 'Linux sed -i'
        sed -i "$@"
    fi
}

# $1 = The message: "Deploy <service>: BEGIN"
# $2 = Workspace name:
# $3 = Package name: 
# $4 = Versionset name:
function download_and_build_package() {
    echo -e echo -e "${GREEN}Setup $3: BEGIN${NC}"
    if [[ ! -d "$2/src/$3" ]]; then
        echo -e "${YELLOW}Creating workspace and adding required packages${NC}"
        brazil ws --create -n $2 -vs $4
        cd $2
        if [ "$IS_MAC" = '1' ]; then
            echo "`yes|brazil setup platform-support`" # yes + pipefail = :-( swallow non-0 exit statuses just here
        fi

        brazil ws --use -p $3

        # Pipeline/Versionset is "Containers" but package is "Container"
        if [ "$2/src/$3" = "AemiliaContainers/src/AemiliaContainer" ]; then
            brazil ws --use -p "AemiliaContainerNode10"

            # Modify Node10 package
            originalText='RUN gpg --keyserver hkp:\/\/pool.sks-keyservers.net --recv-keys 409B6B1796C275462A1703113804BB82D39DC0E3 7D2BAF1CF37B13E2069D6956105BD0E739499BDB \&\& \\'
            newText='RUN curl -sSL https:\/\/rvm.io\/mpapis.asc \| gpg --import - \&\& curl -sSL https:\/\/rvm.io\/pkuczynski.asc \| gpg --import - \&\& \\'
            sed_dash_i "s/$originalText/$newText/g" src/AemiliaContainerNode10/configuration/Dockerfile.template
            
            # Modify Container package
            originalText="arn:aws:iam::288275683263:root"
            newText="arn:aws:iam::$(echo ${ACCOUNT_ID}):root"
            sed_dash_i "s/$originalText/$newText/g" src/AemiliaContainer/configuration/cloudFormation/deploy.template.yml

            originalText="033345365959"
            newText="$(echo ${ACCOUNT_ID})"
            sed_dash_i "s/$originalText/$newText/g" src/AemiliaContainer/configuration/cloudFormation/deploy.template.yml

            # Remove everything after "ImageDeployer:"
            sed_dash_i "/ImageDeployer:/,$ d" src/AemiliaContainer/configuration/cloudFormation/deploy.template.yml

            # Remove hydra role
            rm src/AemiliaContainer/configuration/cloudFormation/modifiedHydraInvocationRole.template.yml
        fi

        # Update the model package for Control Plane
        if [ "$2/src/$3" = "AemiliaControlPlaneLambda/src/AemiliaControlPlaneLambda" ]; then
            brazil ws --use -p "AemiliaControlPlaneLambdaModel"
            cd "src/AemiliaControlPlaneLambdaModel"

            # 💥Need to set this to false in order to deploy locally - NEVER CHECK IN THIS CHANGE! 💥 #
            sed_dash_i 's/"enableCloudTrail": "true"/"enableCloudTrail": "false"/g' build.json
            sed_dash_i 's/"enableTagging": true/"enableTagging": false/g' build.json
            cd ../../
        fi

        # Remove integration tests YML files for Pioneer
        if [ "$2/src/$3" = "AWSMobilePioneerExecute/src/AWSMobilePioneerExecute" ]; then
            rm "src/$3/configuration/cloudFormation/integrationTestBucket.template.yml"
            rm "src/$3/configuration/cloudFormation/modifiedHydraInvocationRole.template.yml"
        fi

        cd "src/$3"
    else
        cd "$2/src/$3"
    fi

    brazil ws clean
    brazil ws --sync --md
    if [[ $RAINBOW_MODE = "yes" ]]
    then
        brazil-recursive-cmd "brazil-build-rainbow"
    else
        brazil-recursive-cmd "brazil-build"
    fi

    sed_dash_i "s/YOUR_ACCOUNT_ID_HERE/$(echo ${ACCOUNT_ID})/g" SAMToolkit.devenv
    sed_dash_i "s/YOUR_ALIAS_HERE/$(echo ${USER_ALIAS})/g" SAMToolkit.devenv

    echo -e "${GREEN}Deploy $3: SUCCESS${NC}"l
    cd ../../..
}


# Setup
echo -e "${GREEN}Ref: https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/DevelopmentRunbook/#HUsingdeployscript${NC}"
echo -e "${YELLOW}This tool will setup your workspace, download all the necessary packages, and update the your SAM files${NC}"
echo -e "${YELLOW}This tool will not do the deployment!  In order to deploy use the deployment script 'amplify_backend_packages_deploy.sh'${NC}"
set -x #echo commands

# Making common directory and navigating inside
if [[ ! -d "AMPLIFY" ]]; then
    mkdir AMPLIFY
fi
cd AMPLIFY

##### Deployment order matters ##### --> # download packages and update SAM files
download_and_build_package "Setup webhook processor: BEGIN" "AemiliaWebhookProcessorLambda" "AemiliaWebhookProcessorLambda" "AemiliaWebhookProcessorLambda/development"
download_and_build_package "Setup dynamodb stream: BEGIN" "AemiliaDynamoDBStreamLambda" "AemiliaDynamoDBStreamLambda" "AemiliaDynamoDBStreamLambda/development"
download_and_build_package "Setup control plane: BEGIN" "AemiliaControlPlaneLambda" "AemiliaControlPlaneLambda" "AemiliaControlPlaneLambda/development"
download_and_build_package "Setup workers lambda: BEGIN" "AemiliaWorkersLambda" "AemiliaWorkersLambda" "AemiliaWorkersLambda/development"
download_and_build_package "Setup warming pool: BEGIN" "AemiliaWarmingPoolInfrastructure" "AemiliaWarmingPool" "AemiliaWarmingPoolInfrastructure/development"
#download_and_build_package "Setup edge lambda: BEGIN" "AemiliaEdgeLambda" "AemiliaEdgeLambda" # Maybe one day 🙄 - Amazon Linux 2 x86_64
download_and_build_package "Setup pioneer execute: BEGIN" "AWSMobilePioneerExecute" "AWSMobilePioneerExecute" "AWSMobilePioneer/execute"
download_and_build_package "Setup container lambda: BEGIN" "AemiliaContainerLambda" "AemiliaContainerLambda" "AemiliaContainerLambda/development"
download_and_build_package "Setup Containers: BEGIN" "AemiliaContainers" "AemiliaContainer" "AemiliaContainers/development"

echo -e "${GREEN}ALL ITEMS COMPLETE. SCRIPT END.${NC}"
