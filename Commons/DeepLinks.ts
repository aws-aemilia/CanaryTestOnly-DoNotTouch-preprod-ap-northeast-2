export function getCloudWatchInsightsLink(
  queryId: string,
  start: Date,
  end: Date,
  query: string,
  sourceGroup: string,
  region = "us-east-1"
) {
  const p = (m: string) => escape(m);

  // encodes inner values
  const s = (m: string) => escape(m).replace(/\%/gi, "*");

  const queryDetail =
    p(`~(end~'`) +
    s(end.toISOString()) +
    p(`~start~'`) +
    s(start.toISOString()) +
    p(`~timeType~'ABSOLUTE~tz~'UTC~editorString~'`) +
    s(query) +
    p(`~isLiveTail~false~queryId~'`) +
    s(queryId) +
    p(`~source~(~'`) +
    s(sourceGroup) +
    p(`))`);

  return (
    `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:logs-insights` +
    escape("?queryDetail=" + queryDetail).replace(/\%/gi, "$")
  );
}

export function getLogStreamLink(
  logGroup: string,
  logStream: string,
  start: Date,
  region = "us-east-1"
) {
  const encode = (m: string) => encodeURIComponent(m).replace(/\%/gi, "$");
  const doubleEncode = (m: string) =>
    encodeURIComponent(encodeURIComponent(m)).replace(/\%/gi, "$");

  return (
    `https://console.aws.amazon.com/cloudwatch/home?region=${region}#logsV2:log-groups/log-group/${logGroup}/log-events/${doubleEncode(
      logStream
    )}${encode("?start=")}` + doubleEncode(start.toISOString())
  );
}
console.log(
  getLogStreamLink(
    "AWSCodeBuild",
    "dbf79gof0rzzu/27e924a4-eb24-451e-afa7-ae84f855500d",
    new Date(1698939383801),
    "us-east-1"
  )
);

export function getIsenLink(
  accountId: string,
  role: string,
  destination: string
) {
  return `https://isengard.amazon.com/federate?account=${accountId}&role=${role}&destination=${encodeURIComponent(
    destination
  )}`;
}
