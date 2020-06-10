#!/bin/bash
# Iterates over all functions and provide the option to delete all versions of each function
# except for the last $VERSIONS_TO_KEEP versions (default 3)
# this is a modified version of https://code.amazon.com/packages/MoroccoServiceUsefulScripts/blobs/mainline/--/GarbageCollection/cleanup_old_lambda_versions.sh

usage() {
  echo "Usage: $0 [aws_profile [aws_region] [number_of_versions_to_keep]]"
}

AWS_PROFILE=${2:-default}
AWS_REGION=${3:-${AWS_REGION:-us-west-2}}
VERSIONS_TO_KEEP=${4:-3}
# echo "Using AWS Profile ${AWS_PROFILE}"

set -eu

delete_lambdas() {
  echo "===="
  echo "Iterating through functions in $AWS_REGION to delete any versions older than last $VERSIONS_TO_KEEP using AWS Profile $AWS_PROFILE"
  echo "===="
  sleep 1
  lambdas=$(aws --profile "$AWS_PROFILE" --region ${AWS_REGION} lambda list-functions --no-paginate --query "Functions[*].FunctionName" | jq -r '.[]')
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
  done
}

delete_old_versions() {
  # https://stackoverflow.com/questions/28055346/bash-unbound-variable-array-script-s3-bash
  declare -a versions
  
  version_arns=$(aws --profile "$AWS_PROFILE" --region ${AWS_REGION} lambda list-versions-by-function --no-paginate --function-name $1 \
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
  printf "Would you like to delete all versions up to and including version $newest_version_to_delete? Make sure you're following the two-person rule if in a production environment. (y/n): "
  read DELETE
  while true ; do
    case "$DELETE" in
      y|yes)
        for version_arn in ${version_arns[@]}; do
          version_num=$(echo $version_arn | grep -Eo "[0-9]+$")
          # WARNING - gaps in function versions may not be taken into account
          # for example, if the function has only versions 1, 2, 3, and 7, then versions 2 and 3 will be deleted if $VERSIONS_TO_KEEP is set to 3
          if [[ $version_num -le $newest_version_to_delete ]]
          then
            echo "Deleting version $version_num";
            # Commented out by default to encourage testing expected output first - uncomment when ready to delete
            aws --profile "$AWS_PROFILE" --region ${AWS_REGION} lambda delete-function --function-name ${version_arn}
          else
            echo "Skipping version $version_num";
          fi
        done
        break
        ;;
      n|no)
        echo "Okay. Nothing deleted."
        break
        ;;
      *)
        echo "Didn't recognize your response. Please answer yes or no."
        read -p "Do you want to delete the above listed functions? " DELETE
        ;;
    esac
  done
}

delete_lambdas