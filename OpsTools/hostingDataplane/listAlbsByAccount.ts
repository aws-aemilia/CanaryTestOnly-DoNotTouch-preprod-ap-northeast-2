import fs from "fs";

import pino from "pino";
import pinoPretty from "pino-pretty";

import * as elb from "@aws-sdk/client-elastic-load-balancing-v2";

import { dataPlaneAccounts, getIsengardCredentialsProvider } from "../../Isengard";

const logger = pino(pinoPretty());

async function main() {
  const accounts = await dataPlaneAccounts({ stage: "prod" });

  let result: Record<string, { accountId: string; stage: string; region: string; loadBalancerNames: string[] }> = {};

  for (let { accountId, region, stage } of accounts) {
    let out = {
      accountId,
      region,
      stage,
      loadBalancerNames: new Array<string>(),
    };

    const client = new elb.ElasticLoadBalancingV2Client({
      region,
      credentials: getIsengardCredentialsProvider(accountId, "ReadOnly"),
    });

    let paginator = elb.paginateDescribeLoadBalancers({ client, pageSize: 10 }, {});
    for await (const { LoadBalancers: albs } of paginator) {
      for (let alb of albs ?? []) {
        if (!alb.LoadBalancerName || !alb.LoadBalancerArn) {
          continue;
        }

        let fullName = alb.LoadBalancerArn.substring(alb.LoadBalancerArn.indexOf(":loadbalancer/") + ":loadbalancer/".length);
        out.loadBalancerNames.push(fullName);
      }
    }

    result[accountId] = out;

    logger.info(out);
  }

  fs.writeFileSync("./loadBalancers.json", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
