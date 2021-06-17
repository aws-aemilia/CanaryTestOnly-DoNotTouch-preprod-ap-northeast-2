#!/bin/zsh
#accountid, region, starttime, endtime, query, loggroup_prefix, filename

function exitIfUnset {
  if [ -z "$1" ]; then
    echo "$2\n";
    exit 1;
  fi
}
ACCOUNT_ID=$1
REGION=$2
START_TIME=$(perl -MDate::Manip -e 'print UnixDate(ParseDate("'$3'"),"%s")')
END_TIME=$(perl -MDate::Manip -e 'print UnixDate(ParseDate("'$4'"),"%s")')
QUERY=$5
LOG_GROUP_PREFIX=$6
# FILENAME=$7
FILENAME=$REGION
RUN_ID=$8

ONE_DAY=86400
SEARCH_START=$(($START_TIME))
SEARCH_END=$(($START_TIME+$ONE_DAY))

while [[ $SEARCH_START -le $END_TIME ]]
do
  export AWS_ACCESS_KEY_ID="";export AWS_SECRET_ACCESS_KEY="";export AWS_SESSION_TOKEN="";

  credentials=$(curl -s -S -b ~/.midway/cookie -c ~/.midway/cookie -L -X POST --header "X-Amz-Target: IsengardService.GetAssumeRoleCredentials" --header "Content-Encoding: amz-1.0" --header "Content-Type: application/json; charset=UTF-8" -d "{\"AWSAccountID\": \"$ACCOUNT_ID\", \"IAMRoleName\":\"ReadOnly\"}" https://isengard-service.amazon.com | perl -ne 'use Term::ANSIColor qw(:constants); my $line = $_; my %lookup = (sessionToken=>"AWS_SESSION_TOKEN",secretAccessKey=>"AWS_SECRET_ACCESS_KEY",accessKeyId=>"AWS_ACCESS_KEY_ID"); while (($key, $value) = each (%lookup)) {my $val = $line; die BOLD WHITE ON_RED . "Unable to get credentials did you run mwinit and do you have access to the role?\n" . RESET . RED . "$line" . RESET . "\n" if ($line=~/error/);$val =~ s/.*?\\?"$key\\?":\\?"(.*?)\\?".*$/$1/e; chomp($val); print "export $value=$val\n";}print "export AWS_DEFAULT_REGION='$REGION'\n";');$(echo $credentials);

  exitIfUnset "$AWS_ACCESS_KEY_ID" "Unable to get credentials"

  LOG_GROUP=$(aws logs describe-log-groups --log-group-name-prefix ${LOG_GROUP_PREFIX} --query "reverse(sort_by(logGroups, &creationTime))[:1].logGroupName"  --output text)

  exitIfUnset "$LOG_GROUP" "Unable to find log group with prefix${LOG_GROUP_PREFIX}"

  QUERY_ID=$(aws logs start-query --log-group-name $LOG_GROUP --end-time $SEARCH_END --start-time $SEARCH_START --query-string $QUERY --output text --query "queryId" --limit 10000)

  exitIfUnset "$QUERY_ID" "Unable to start query"

  echo "Run Id: $RUN_ID"
  echo "Region: $REGION"
  echo "Filename: $FILENAME"
  echo "Query Id: $QUERY_ID"
  echo "Service Log Group: $LOG_GROUP"
  SEARCH_START_FORMATTED=$(perl -e 'use POSIX qw(strftime); print strftime "%F %T %Z",localtime('$SEARCH_START')')
  echo "Search Start:" $SEARCH_START_FORMATTED
  SEARCH_END_FORMATTED=$(perl -e 'use POSIX qw(strftime); print strftime "%F %T %Z",localtime('$SEARCH_START')')
  echo "Search End:" $SEARCH_END_FORMATTED
  echo "Query: $QUERY"
  while true; do
    STATUS=`aws logs get-query-results --query-id $QUERY_ID --output text --query "status"`
    echo "$REGION query (start: $SEARCH_START, end: $SEARCH_END) status: $STATUS"
    [[ "$STATUS" == 'Scheduled' || "$STATUS" == 'Running' ]] || break
    sleep 5
  done

  TODAY=$(date +%Y-%m-%d)
  OUTPUT_DIR="output/$TODAY-$RUN_ID"
  mkdir -p $OUTPUT_DIR
  touch $OUTPUT_DIR/$FILENAME
  echo "output dir $OUTPUT_DIR"
  aws logs get-query-results --query-id $QUERY_ID --query "results[*][*].value" --output text | tee -a $OUTPUT_DIR/$FILENAME
  ((SEARCH_START=$SEARCH_START+$ONE_DAY+1))
  ((SEARCH_END=$SEARCH_END+$ONE_DAY))
done