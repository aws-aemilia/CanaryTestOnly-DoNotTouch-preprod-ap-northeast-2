# script to programmatically cut tickets to lambda capacity's bot to automatically increase our provisioned concurrency limits to the pre-approved safe limits 
# we request provisiong concurrency increase since invoke/s is a function of provisioned concurrency (regional invoked/sec = 10x provisioned concurrency)
# uses fluxo api for which we already have an account

# this script can be run one-off for new region build
# populate target_accounts.txt with one service account id per line
# for each account, the script will call fluxo api to cut one ticket for every region to request the limit increase, which should be approved automatically by Lambda's bot

# usage: PASS=<pass> ./increase_lambda_tps.sh
# materialset: com.aws.mobilehub.fluxo

# To audit history:
# https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/ServiceLimits/LambdaConcurrency

#!/bin/bash
# to test against fluxo test endpoint, change both $LOGIN and $PASS to flx-test and $ENDPOINT to https://ticket-api-test.amazon.com/tickets
LOGIN="flx-aws-mobile-hub"
ENDPOINT="https://ticket-api.amazon.com/tickets"
# Lambda concurrency safe limits
# https://code.amazon.com/packages/LambdaOperationalToolsGo/blobs/5a26b6ae802e253d41980a65f3e112b628097a11/--/src/go.amzn.com/cli/rho/concurrency/limits/limits.go#L10,L19-L27
get_safe_limit() {
  case $region in
    us-east-1)
      limit=20000
      ;;
    eu-west-1)
      limit=10000
      ;;
    ap-northeast-1)
      limit=10000
      ;;
    us-west-2)
      limit=10000
      ;;
    ap-southeast-2)
      limit=5000
      ;;
    eu-central-1)
      limit=5000
      ;;
    us-east-2)
      limit=5000
      ;;
    *)
      limit=2500
      ;;
  esac
}

echo > tts_created.log

while read account_id; do
  echo "$account_id" >> tts_created.log
  for region in $(aws ec2 describe-regions --all-regions | jq '.Regions[].RegionName'); do
    region=$(echo $region | sed -e 's/"//g')
    echo $region >> tts_created.log
    get_safe_limit
    echo $limit >> tts_created.log
    BODY="requester_login=donkahn&category=AWS&type=Lambda&item=Limit%20Increase%20-%20Concurrent%20Executions&impact=3&assigned_group=AWS%20Lambda%20Capacity%20Orch&short_description=Concurrent%20Requests%20Limit%20Increase%20-%20AWS%20Amplify%20Console&details=BOT%20PROCESS%0D%0AAWS%20ID%3A%20$account_id%0D%0ARequested%20Concurrent%20Limit%3A%20$limit%0D%0ARegion%3A%20$region&building=SEA18-Alexandria&city=Seattle&case_type=Trouble%20Ticket&login_name=&requester_relationship=&priority=Low&vendor_id=&quantity=&purchase_order_id=&asin=&isd=&upc=&title=&binding=&stock_number=&ship_origin=&invoice_number=&physical_location=&tracking_number=&picture_file_imdex_location=&bol_number="
    curl -k -i -u "$LOGIN:$PASS" -d $BODY $ENDPOINT >> tts_created.log
    sleep 10
  done  
done <target_accounts.txt