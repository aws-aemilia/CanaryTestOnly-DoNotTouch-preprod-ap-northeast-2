function isenLink(accountId: string, role: string, url: string) {
  return `https://isengard.amazon.com/federate?account=${accountId}&role=${role}&destination=${encodeURIComponent(
    url
  )}`;
}

function distroMetricsChart(
  distroId: string,
  jobs: { jobId: string; timestamp: string }[]
) {
  const annotations = {
    vertical: [
      {
        color: "#2ca02c",
        label: jobs[0].jobId,
        value: new Date(parseInt(jobs[0].timestamp)).toISOString(),
      },
    ],
  };

  if (jobs.length > 1) {
    annotations.vertical.push({
      color: "#2ca02c",
      label: jobs[jobs.length - 1].jobId,
      value: new Date(parseInt(jobs[jobs.length - 1].timestamp)).toISOString(),
    });
  }

  return {
    metrics: [
      [
        "AWS/CloudFront",
        "5xxErrorRate",
        "Region",
        "Global",
        "DistributionId",
        distroId,
        { color: "#d62728" },
      ],
      [
        "AWS/CloudFront",
        "4xxErrorRate",
        "Region",
        "Global",
        "DistributionId",
        distroId,
      ],
      [
        "AWS/CloudFront",
        "Requests",
        "Region",
        "Global",
        "DistributionId",
        distroId,
        {
          yAxis: "right",
          stat: "Sum",
          color: "#1f77b4",
          visible: false,
        },
      ],
    ],
    view: "timeSeries",
    stacked: false,
    region: "us-east-1",
    stat: "Average",
    period: 300,
    annotations: annotations,
  };
}

export function distroMetricsChartDeeplink({
  accountId,
  distroId,
  jobs,
}: {
  accountId: string;
  distroId: string;
  jobs: { jobId: string; timestamp: string }[];
}) {
  const CW_DEEPLINK_BASE =
    "https://console.aws.amazon.com/cloudwatch/deeplink.js";
  const graphJson = JSON.stringify(distroMetricsChart(distroId, jobs));
  const graphDeeplink = `${CW_DEEPLINK_BASE}?region=us-east-1#metricsV2:graph=${encodeURIComponent(
    graphJson
  )}`;

  return isenLink(accountId, "ReadOnly", graphDeeplink);
}
