import { DomainDAO } from "Commons/dynamodb/tables/DomainDAO";
import { toRegionName } from "Commons/utils/regions";
import { DomainDO } from "Commons/dynamodb";
import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { buildCloudWatchLogsClient } from "Commons/Isengard/awsClients";
import { AmplifyAccount, controlPlaneAccount, Stage } from "Commons/Isengard";
import { insightsQuery } from "Commons/libs/CloudWatch";
import dayjs from "dayjs";
import { distroMetricsChartDeeplink } from "./cwMetrics";
import { AppDAO } from "Commons/dynamodb/tables/AppDAO";
import log from "Commons/utils/logger";

const EXTEND_COMPUTE_QUERY = `
filter deployManifestSpecVersion=1 AND isFault=0 AND isError=0 AND ispresent(jobId)
# filter out integ test accounts
| filter accountId not in ["346244260359","750523565508","093006255971","307464356810","855540725783","281815670300","034888852031","082975104043","781019045697","791916667033","844041873611","539106299143","735211410114","950377910065","190546094896","471988655761","860616599078","967659334112","680080709743","320933843292","393546217698","592963052495","034344708957","535437404437","084251295016","572676795576","441877028529","024109713956","858284624493","226137581026","692058258718","063185686835","048809147308","025709896030","235407138452","399607723084","424795888840","659547700018","137144400800","999225919880","706311624498"]
| sort @timestamp asc
| fields concat(@timestamp, '') as timestamp
| display timestamp, appId, branch, jobId
`;

type SubDomainInfo = {
  distributionId: string;
  prefix: string;
  domainName: string;
  appId: string;
  branch: string;
  url: string;
}[];
const explodeDomain: (domain: DomainDO) => SubDomainInfo = (
  domain: DomainDO
) => {
  const { domainName, distributionId, appId, subDomainDOs } = domain;
  return subDomainDOs.map(({ branch, prefix }) => ({
    branch,
    prefix,
    domainName,
    distributionId,
    appId,
    url: prefix ? `https://${prefix}.${domainName}` : `https://${domainName}`,
  }));
};

const explodeSubdomains = (domains: DomainDO[]): SubDomainInfo => {
  return domains.flatMap(explodeDomain);
};

export type Job = {
  timestamp: string;
  appId: string;
  branch: string;
  jobId: string;
};

export class VerifyCommand {
  private domainDAO: DomainDAO;
  private appDAO: AppDAO;
  private cloudWatchLogsClient: CloudWatchLogsClient;
  private controlPlaneAccount: AmplifyAccount;

  constructor({
    DomainDAO,
    AppDAO,
    cloudWatchLogsClient,
    controlPlaneAccount,
  }: {
    DomainDAO: DomainDAO;
    AppDAO: AppDAO;
    cloudWatchLogsClient: CloudWatchLogsClient;
    controlPlaneAccount: AmplifyAccount;
  }) {
    this.domainDAO = DomainDAO;
    this.appDAO = AppDAO;
    this.cloudWatchLogsClient = cloudWatchLogsClient;
    this.controlPlaneAccount = controlPlaneAccount;
  }

  public static async buildDefault(
    stage: string,
    region: string
  ): Promise<VerifyCommand> {
    const acc = await controlPlaneAccount(stage as Stage, toRegionName(region));
    return new VerifyCommand({
      DomainDAO: await DomainDAO.buildDefault(stage, toRegionName(region)),
      AppDAO: await AppDAO.buildDefault(stage, toRegionName(region)),
      cloudWatchLogsClient: buildCloudWatchLogsClient(acc, "FullReadOnly"),
      controlPlaneAccount: acc,
    });
  }

  public async run(hoursAgo = 12) {
    log.info(
      `Finding all the Jobs that used the deployment spec in the last ${hoursAgo} hours`
    );

    const jobs = await this.getDeploymentSpecDeployments(hoursAgo);

    const jobsByBranchObj = jobs.reduce((acc, job) => {
      const { appId, branch, jobId, timestamp } = job;

      acc[`${appId}-${branch}`] = acc[`${appId}-${branch}`] ?? {
        appId,
        branch,
        jobs: [],
      };
      acc[`${appId}-${branch}`].jobs.push({ jobId, timestamp });
      return acc;
    }, {} as Record<string, { appId: string; branch: string; jobs: { jobId: string; timestamp: string }[] }>);

    const jobsByBranch = Object.values(jobsByBranchObj);

    for (const job of jobsByBranch) {
      await this.analyzeBranchJobs(job);
    }
  }

  public async getDeploymentSpecDeployments(hoursAgo: number): Promise<Job[]> {
    const now = new Date();

    const results = await insightsQuery(
      this.cloudWatchLogsClient,
      "AWSCodeBuild",
      EXTEND_COMPUTE_QUERY,
      dayjs(now).subtract(hoursAgo, "hour").toDate(),
      now
    );

    return results as Job[];
  }

  public async analyzeBranchJobs(job: {
    appId: string;
    branch: string;
    jobs: { jobId: string; timestamp: string }[];
  }) {
    console.log("\n============================================");
    const { appId, branch, jobs } = job;
    const app = await this.appDAO.getAppById(appId);

    if (!app) {
      console.log(
        `App ${appId} not found. Most likely it was deleted. The build jobs found were: ${JSON.stringify(
          job
        )}`
      );
      return;
    }

    const domains = await this.domainDAO.findDomainsByAppId(appId);
    const subDomainsForBranch = explodeSubdomains(domains).filter(
      (d) => d.branch === branch
    );

    const groupedByDistributionId = subDomainsForBranch.reduce(
      (acc, subDomain) => {
        acc[subDomain.distributionId] = acc[subDomain.distributionId] ?? [];
        acc[subDomain.distributionId].push(subDomain);
        return acc;
      },
      {} as Record<string, SubDomainInfo>
    );

    console.log(`appId: ${appId}`);
    console.log(`branch: ${branch}`);
    console.log(
      `jobs found: ${jobs.length} - ${JSON.stringify(jobs.map((j) => j.jobId))}`
    );
    console.log(`https://genie.console.amplify.aws.a2z.com/prod/app/${appId}`);
    console.log();
    console.log(`> ${app.cloudFrontDistributionId}`);
    console.log(`https://${branch}.${appId}.amplifyapp.com`);
    console.log(
      `CloudFront Metrics: ${distroMetricsChartDeeplink({
        distroId: app.cloudFrontDistributionId,
        jobs: jobs,
        accountId: this.controlPlaneAccount.accountId,
      })}`
    );

    for (const [distroId, subDomainsForBranch] of Object.entries(
      groupedByDistributionId
    )) {
      console.log();
      console.log(`> ${distroId}`);
      console.log(subDomainsForBranch.map(({ url }) => url).join(", "));
      console.log(
        `CloudFront Metrics: ${distroMetricsChartDeeplink({
          distroId: distroId,
          jobs: jobs,
          accountId: this.controlPlaneAccount.accountId,
        })}`
      );
    }
  }
}
