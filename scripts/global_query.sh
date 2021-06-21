#!/bin/zsh
# accountid, region, starttime, endtime, query, log group_prefix, filename
# requires accounts file to exist in same directory

if [[ ! -f accounts ]] then
  echo "ERROR: accounts file not present in current directory"
  exit 1
fi

function exitIfUnset {
  if [ -z "$1" ]; then
    echo "$2\n";
    exit 1;
  fi
}

RUN_ID=$1
START_TIME=$(perl -MDate::Manip -e 'print UnixDate(ParseDate("'$2'"),"%s")')
END_TIME=$(perl -MDate::Manip -e 'print UnixDate(ParseDate("'$3'"),"%s")')
QUERY=$4
LOG_GROUP_PREFIX=$5

ONE_DAY=86400
SEARCH_START=$(($START_TIME))
SEARCH_END=$(($START_TIME+$ONE_DAY))

echo "Run Id: $RUN_ID"
echo "Query: $QUERY"

function getLogs {
  while [[ $SEARCH_START -le $END_TIME ]]
  do
    export AWS_ACCESS_KEY_ID="";export AWS_SECRET_ACCESS_KEY="";export AWS_SESSION_TOKEN="";

    credentials=$(curl -s -S -b ~/.midway/cookie -c ~/.midway/cookie -L -X POST --header "X-Amz-Target: IsengardService.GetAssumeRoleCredentials" --header "Content-Encoding: amz-1.0" --header "Content-Type: application/json; charset=UTF-8" -d "{\"AWSAccountID\": \"$ACCOUNT_ID\", \"IAMRoleName\":\"ReadOnly\"}" https://isengard-service.amazon.com | perl -ne 'use Term::ANSIColor qw(:constants); my $line = $_; my %lookup = (sessionToken=>"AWS_SESSION_TOKEN",secretAccessKey=>"AWS_SECRET_ACCESS_KEY",accessKeyId=>"AWS_ACCESS_KEY_ID"); while (($key, $value) = each (%lookup)) {my $val = $line; die BOLD WHITE ON_RED . "Unable to get credentials did you run mwinit and do you have access to the role?\n" . RESET . RED . "$line" . RESET . "\n" if ($line=~/error/);$val =~ s/.*?\\?"$key\\?":\\?"(.*?)\\?".*$/$1/e; chomp($val); print "export $value=$val\n";}print "export AWS_DEFAULT_REGION='$REGION'\n";');$(echo $credentials);

    exitIfUnset "$AWS_ACCESS_KEY_ID" "Unable to get credentials"

    LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix ${LOG_GROUP_PREFIX} --query "reverse(sort_by(logGroups, &creationTime))[:1].logGroupName"  --output text)
    echo "Service Log Group: $LOG_GROUP"


    QUERY_ID=$(aws logs start-query --log-group-name $LOG_GROUP --end-time $SEARCH_END --start-time $SEARCH_START --query-string $QUERY --output text --query "queryId" --limit 10000)

    exitIfUnset "$QUERY_ID" "Unable to start query"
    exitIfUnset "$LOG_GROUP" "Unable to find log group with prefix${LOG_GROUP_PREFIX}"
    echo "Query Id: $QUERY_ID"
    SEARCH_START_FORMATTED=$(perl -e 'use POSIX qw(strftime); print strftime "%F %T %Z",localtime('$SEARCH_START')')
    echo "Search Start:" $SEARCH_START_FORMATTED
    SEARCH_END_FORMATTED=$(perl -e 'use POSIX qw(strftime); print strftime "%F %T %Z",localtime('$SEARCH_END')')
    echo "Search End:" $SEARCH_END_FORMATTED

    while true; do
      STATUS=`aws logs get-query-results --query-id $QUERY_ID --output text --query "status"`
      echo "$REGION query (start: $SEARCH_START_FORMATTED, end: $SEARCH_END_FORMATTED) status: $STATUS"
      [[ "$STATUS" == 'Scheduled' || "$STATUS" == 'Running' ]] || break
      sleep 5
    done

    TODAY=$(date +%Y-%m-%d)
    OUTPUT_DIR="output/$TODAY-$RUN_ID"
    mkdir -p $OUTPUT_DIR
    aws logs get-query-results --query-id $QUERY_ID --query "results[*][*].value" --output text | tee -a "$OUTPUT_DIR/$REGION" 1> /dev/null
    ((SEARCH_START=$SEARCH_END+1))
    ((SEARCH_END=$SEARCH_END+$ONE_DAY))
  done
}

cat accounts | while read ACCOUNT_ID REGION; do
  echo "Account: $ACCOUNT_ID, Region: $REGION"
  getLogs&
done;