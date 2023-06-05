export function buildMinervaCommand({
  controlPlaneAccountId,
  integTestAccountId,
  limitName,
  ripServiceName,
  region,
  value,
}: {
  controlPlaneAccountId: string;
  integTestAccountId: string;
  limitName: string;
  ripServiceName: string;
  region: string;
  value: string;
}) {
  return (
    `export AWS_ACCESS_KEY_ID=""
export AWS_SECRET_ACCESS_KEY=""
export AWS_SESSION_TOKEN=""

` +
    'credentials=$(curl -s -S -b ~/.midway/cookie -c ~/.midway/cookie -L -X POST --header "X-Amz-Target: IsengardService.GetAssumeRoleCredentials" --header "Content-Encoding: amz-1.0" --header "Content-Type: application/json; charset=UTF-8" -d \'{"AWSAccountID": "' +
    controlPlaneAccountId +
    '", "IAMRoleName":"SDCLimitManagement"}\' https://isengard-service.amazon.com | perl -ne \'use Term::ANSIColor qw(:constants); my $line = $_; my %lookup = (sessionToken=>"AWS_SESSION_TOKEN",secretAccessKey=>"AWS_SECRET_ACCESS_KEY",accessKeyId=>"AWS_ACCESS_KEY_ID"); while (($key, $value) = each (%lookup)) {my $val = $line; die BOLD WHITE ON_RED . "Unable to get credentials did you run mwinit and do you have access to the role?\\n" . RESET . RED . "$line" . RESET . "\\n" if ($line=~/error/);$val =~ s/.*?\\\\?"$key\\\\?":\\\\?"(.*?)\\\\?".*$/$1/e; chomp($val); print "export $value=$val\\n";}print "export AWS_DEFAULT_REGION=' +
    region +
    "\\n\";')" +
    `
$(echo $credentials)

/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva set-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${region} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${integTestAccountId} \\
    --value LimitType=SINGLE_VALUE,SingleValue=${value}

/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva get-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${region} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${integTestAccountId} \\
    --output json
  `
  );
}
