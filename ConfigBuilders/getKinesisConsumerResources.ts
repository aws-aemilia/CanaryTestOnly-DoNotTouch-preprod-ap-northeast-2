import {
  kinesisConsumerAccounts,
  getIsengardCredentialsProvider,
} from "Commons/Isengard";
import {
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
} from "@aws-sdk/client-ecs";
import fs from "fs";
import logger from "Commons/utils/logger";

/**
 * Use this script to generate the kinesisConsumer.json file in the dashboards package:
 * https://code.amazon.com/packages/AWSAmplifyHostingDashboardsCDK/blobs/mainline/--/lib/accounts/resources/kinesisConsumer.json
 *
 * That json file is used to build the Kinesis Consumer dashboard.
 * https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Dashboard/KinesisConsumer
 *
 * To run it:
 * npx ts-node ConfigBuilders/getKinesisConsumerResources.ts
 */

interface Resources {
  ecsServiceName: string;
  ecsClusterName: string;
}

async function main() {
  const accounts = await kinesisConsumerAccounts();
  const output = "kinesisConsumer.json";
  const resources: { [accountId: string]: Resources } = {};

  for (const account of accounts) {
    const ecsClient = new ECSClient({
      region: account.region,
      credentials: getIsengardCredentialsProvider(
        account.accountId,
        "ReadOnly"
      ),
    });

    const clusters = await ecsClient.send(new ListClustersCommand({}));
    if (!clusters || !clusters.clusterArns) {
      throw new Error("No clusters found in account " + account.airportCode);
    }

    const clusterArn = clusters.clusterArns.filter(
      (arn) => !arn.includes("CODETEST-")
    )[0];
    logger.info("Cluster %s", clusterArn);

    const services = await ecsClient.send(
      new ListServicesCommand({
        cluster: clusterArn,
      })
    );

    if (!services || !services.serviceArns) {
      throw new Error("No services found in account " + account.airportCode);
    }

    const serviceArn = services.serviceArns[0];
    logger.info("Service %s", serviceArn);

    resources[account.accountId] = {
      ecsServiceName: serviceArn.split("/")[2],
      ecsClusterName: clusterArn.split("/")[1],
    };
  }

  fs.writeFileSync(output, JSON.stringify(resources, null, 2));
}

main()
  .then(() => logger.info("Done"))
  .catch((error) => logger.error(error));
