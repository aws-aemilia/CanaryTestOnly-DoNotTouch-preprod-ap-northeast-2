export function buildMinervaCommand({
  accountId,
  limitName,
  ripServiceName,
  regionName,
  value,
}: {
  accountId: string;
  limitName: string;
  ripServiceName: string;
  regionName: string;
  value: string;
}) {
  return `
/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva set-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${accountId} \\
    --value LimitType=SINGLE_VALUE,SingleValue=${value}

/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva get-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${accountId} \\
    --output json
  `;
}
