#!/bin/bash
# Iterates over all functions and delete all versions of each function before $VERIONS_TO_KEEP
# this is a modified version of https://code.amazon.com/packages/MoroccoServiceUsefulScripts/blobs/mainline/--/GarbageCollection/cleanup_old_lambda_versions.sh

# Arguments:
# Region (default us-west-2)
# Number of Versions to Keep (default 3)

AWS_REGION=${1:-${AWS_REGION:-us-west-2}}
VERSIONS_TO_KEEP=${2:-3}
export AWS_PAGER=""
code_storage=0
set -eu

get_code_storage() {
  code_storage=$(aws lambda list-functions --function-version ALL --query 'sum(Functions[*].CodeSize)' --region $AWS_REGION)
  code_storage=$(($code_storage / 1024 / 1024 / 1024))
  echo "Current Lambda code storage in $AWS_REGION: $code_storage GB"
}

delete_lambdas() {
  echo "===="
  echo "Make sure you're following the two-person rule if in a production environment!"
  echo "Iterating through functions in $AWS_REGION to delete any versions older than last $VERSIONS_TO_KEEP"
  echo "Calculating storage usage in $AWS_REGION, if you have many functions/versions this could take a minute..."
  get_code_storage
  echo "===="
  sleep 2
  lambdas=$(aws --region ${AWS_REGION} lambda list-functions --no-paginate --query "Functions[*].FunctionName" | jq -r '.[]')
  [[ ! ${lambdas[@]} ]] && echo "No Lambdas found." && exit 1
  echo "Lambdas found:"
  echo "${lambdas}"
  echo
  echo "Listing old versions of above lambda functions..."
  echo
  for lambda in ${lambdas[@]}; do
    echo "===="
    echo "Lambda: ${lambda}"
    delete_old_versions $lambda
    echo "Done deleting old versions of lambda function: ${lambda}"
  done
  get_code_storage
}

delete_old_versions() {
  # https://stackoverflow.com/questions/28055346/bash-unbound-variable-array-script-s3-bash
  declare -a versions
  
  version_arns=$(aws --region ${AWS_REGION} lambda list-versions-by-function --no-paginate --function-name $1 \
    --query "Versions[?ends_with(FunctionArn, \`LATEST\`) == \`false\`].FunctionArn"  | jq -r '.[]')
  [[ ! ${version_arns[@]} ]] && echo "No versions found, skipping" && return

  number_of_versions=$(wc -w <<< $version_arns)
  echo "Number of verisons: $number_of_versions"
  [[ $number_of_versions -le $VERSIONS_TO_KEEP ]] && echo "No excess versions to delete, skipping" && return

  highest_version=$(aws lambda list-versions-by-function --function-name $1 --query "Versions[?!ends_with(FunctionArn, \`LATEST\`)].FunctionArn"  | jq -r '[.[] | match("\\d+$") | .string | tonumber] | sort | .[-1]')
  newest_version_to_delete=$((highest_version - $VERSIONS_TO_KEEP))
  echo "versions:"
  echo "${version_arns}"
  echo "versions to keep:"
  echo $(seq $((newest_version_to_delete + 1)) $highest_version)
  echo "Deleting all versions up to and including version $newest_version_to_delete"
  
  aliases=$(aws --region ${AWS_REGION} lambda list-aliases --no-paginate --function-name $1)
  for version_arn in ${version_arns[@]}; do
    version_num=$(echo $version_arn | grep -Eo "[0-9]+$")
    # WARNING - gaps in function versions may not be taken into account
    # for example, if the function has only versions 1, 2, 3, and 7, then versions 2 and 3 will be deleted if $VERSIONS_TO_KEEP is set to 3
    if [[ $version_num -le $newest_version_to_delete ]]
    then
      if echo $aliases | grep -q \"$version_num\"
      then
        echo "Version ${version_num} has an alias referencing it, skipping"
      else
        echo "Deleting version $version_num";
        # Commented out by default to encourage testing expected output first - uncomment when ready to delete
        aws --region ${AWS_REGION} lambda delete-function --function-name ${version_arn}
      fi
    else
      echo "Skipping version $version_num";
    fi
  done
}

delete_lambdas