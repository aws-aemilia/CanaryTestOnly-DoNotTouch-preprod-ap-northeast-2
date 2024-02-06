export function updateCommand({
  subjectId,
  subjectType,
  limitName,
  ripServiceName,
  regionName,
  value,
}: {
  subjectId: string;
  subjectType: "RESOURCE" | "ACCOUNT";
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
    --subject-type ${subjectType} \\
    --subject-id ${subjectId} \\
    --value LimitType=SINGLE_VALUE,SingleValue=${value}

${getCommand({ subjectId, subjectType, limitName, ripServiceName, regionName })}
  `;
}

export function getCommand({
  subjectId,
  subjectType,
  limitName,
  ripServiceName,
  regionName,
}: {
  subjectId: string;
  subjectType: "RESOURCE" | "ACCOUNT";
  limitName: string;
  ripServiceName: string;
  regionName: string;
}) {
  return `
    /apollo/env/AWSMinervaCLI/bin/aws-minerva minerva get-subject-limit \\
    --rip-service-name ${ripServiceName} \\
    --region ${regionName} \\
    --internal-limit-name ${limitName} \\
    --subject-type ${subjectType} \\
    --subject-id ${subjectId} \\
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
