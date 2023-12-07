export function updateCommand({
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

${getCommand({ accountId, limitName, ripServiceName, regionName })}
  `;
}

export function getCommand({
  accountId,
  limitName,
  ripServiceName,
  regionName,
}: {
  accountId: string;
  limitName: string;
  ripServiceName: string;
  regionName: string;
}) {
  return `
/apollo/env/AWSMinervaCLI/bin/aws-minerva minerva get-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ACCOUNT \\
    --subject-id ${accountId} \\
    --output json
  `;
}

export function getRipServiceName(stage: string) {
  if (stage === "beta") {
    return "amplify/amplify_beta";
  } else if (stage === "gamma") {
    return "amplify/amplify_gamma";
  }

  return "amplify";
}
