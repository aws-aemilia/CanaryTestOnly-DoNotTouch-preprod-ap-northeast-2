regions=(
    ap-east-1
    ap-northeast-1
    ap-northeast-2
    ap-south-1
    ap-southeast-1
    ap-southeast-2
    ca-central-1
    eu-central-1
    eu-north-1
    eu-south-1
    eu-west-1
    eu-west-2
    eu-west-3
    me-south-1
    sa-east-1
    us-east-1
    us-east-2
    us-west-1
    us-west-2
)

out_dir="out-2"

# for region in "${regions[@]}"
# do
# 	echo "Executing billingAuditor for $region; outDir=$out_dir"
#     ts-node billingAuditor.ts --stage prod --region $region --konaFile "konafiles/2022-09-01" --startDate "2022-08-01T00:00:00" --outDir "$out_dir"
#     ts-node generateAccountsImpacted --branchArnsFile "$out_dir/$region-invalidBilledArns.txt" --impactedAccountsFile "$out_dir/$region-impacted-accounts.txt"
# done



# for region in "${regions[@]}"
# do
# 	echo "Executing billingAuditor for $region"
#     echo "ts-node billingAuditor.ts --stage prod --region $region --konaFile \"konafiles/2022-09-01\" --startDate \"2022-08-01T00:00:00\" --outDir \"out-1\""
#     ts-node billingAuditor.ts --stage prod --region $region --konaFile "konafiles/2022-09-01" --startDate "2022-08-01T00:00:00" --outDir "out-1"
# done
# ts-node generateAccountsImpacted --branchArnsFile "out/icn-invalidBilledArns-2022-09-27T20:44:50.287Z.txt" --impactedAccountsFile "out/icn-impacted-accounts.txt"


for region in "${regions[@]}"
do
	echo "Executing generateDeactivateMessages for $region"
    ts-node generateDeactivateMessages --branchArnsFile "out-2/$region-invalidBilledArns.txt" --remoRecordFile "konafiles/metering-records-snapshot" --messagesOutFile "out-2/$region-deactivateMessages.txt"
done