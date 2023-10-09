import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import yargs from "yargs";
import { Region, StandardRoles } from "../../Commons/Isengard/types";
import { TicketyService } from "../../Commons/SimT/Tickety";
import {
  getMemoizedCloudWatchLogsClient,
  insightsQuery,
} from "../../Commons/libs/CloudWatch";
import { getMemoizedDynamoDBClient } from "../../Commons/libs/DynamoDb";
import { createLogger } from "../../Commons/utils/logger";
import { getServiceComponentQueries } from "./get-service-component-queries";
import { ServiceComponent, MetricType } from "./service-components";
import { mapAppIdsToCustomerAccountIds } from "Commons/dynamodb";
import { preflightCAZForAccountRoleCombinations } from "Commons/Isengard/contingentAuthZ";
import { AmplifyAccount, controlPlaneAccount } from "Commons/Isengard";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

dayjs.extend(utc);
const logger = createLogger();

// TODO: COE action item flavor - Where the impact is not just faults, but an adhoc query - For this, you can simply extend the `global-query.ts` script

interface ScriptInput {
  serviceComponents?: ServiceComponent[];
  start: string;
  end?: string;
  watch?: boolean;
  watchInterval?: number;
  regions?: Region[];
  ticket: string;
}

interface CustomerImpactQuery {
  queryString: string;
  logGroupPrefix: string;
  startDate: Date;
  endDate: Date;
  outputType: "accountId" | "appId";
  serviceComponent: ServiceComponent;
  region: Region;
  cloudwatchLogsClient: CloudWatchLogsClient;
  dynamodbClient?: DynamoDBDocumentClient;
  cazParams: {
    account: AmplifyAccount;
    role: StandardRoles;
  }[];
}

interface CustomerImpactOutput {
  id: string;
  region: Region;
  serviceComponent: ServiceComponent;
}

const main = async () => {
  const args = (await yargs(process.argv.slice(2))
    .usage(
      `
        Gather customer impact data across all regions and services. Optionally filter by service, time period and region.

        Usage:
        # Get customer impact across all services
        npm run customerImpact -- --regions us-east-1 --start '2021-08-01 00:00' --ticket P123456789

        # Get customer impact for a specific service
        npm run customerImpact -- --regions us-east-1 --start '2021-08-01 00:00' --services control-plane --ticket P123456789

        # Get customer impact in watch mode
        npm run customerImpact -- --regions us-east-1 --start '2021-08-01 00:00' --ticket P123456789 --watch

        # Get customer impact in watch mode with a custom interval
        npm run customerImpact -- --regions us-east-1 --start '2021-08-01 00:00' --ticket P123456789 --watch --watch-interval 10
      `
    )
    .option("services", {
      describe: "The service component(s) to filter by",
      type: "array",
      alias: "serviceComponents",
      choices: Object.values(ServiceComponent),
      demandOption: false,
    })
    .option("start", {
      describe:
        "The start time of the event in UTC. Format: 'YYYY-MM-DD HH:mm' ",
      type: "string",
      demandOption: true,
    })
    .option("end", {
      describe:
        "The end time of the event in UTC. Format: 'YYYY-MM-DD HH:mm'. Default is now.",
      type: "string",
      demandOption: false,
    })
    .option("regions", {
      describe: "The region(s) to filter by",
      type: "array",
      demandOption: false,
    })
    .option("ticket", {
      describe:
        "Ticket related to customer impacting event (Also used for CAZ if needed)",
      type: "string",
      demandOption: true,
    })
    .option("watch", {
      describe: "If set to true, will keep collecting impact every 5 minutes",
      type: "boolean",
      demandOption: false,
    })
    .option("watch-interval", {
      alias: "watchInterval",
      describe:
        "The interval to watch for impact in minutes. Default is 5 minutes.",
      type: "number",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv) as ScriptInput;

  const { watch, watchInterval } = args;

  if (!watch) {
    return gatherImpact(args);
  }

  const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

  const interval = setInterval(
    async () => {
      try {
        await gatherImpact(args);
      } catch (err) {
        logger.error(`Error gathering customer impact: ${err}`);
        clearInterval(interval);
      }
    },
    watchInterval ? watchInterval * 60 * 1000 : FIVE_MINUTES_IN_MS
  );
};

const gatherImpact = async ({
  serviceComponents,
  start,
  end,
  ticket,
  regions,
}: ScriptInput) => {
  logger.info(`Gathering customer impact for Ticket: ${ticket}`);

  serviceComponents = serviceComponents ?? Object.values(ServiceComponent);
  regions = regions ?? [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "eu-central-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-south-1",
    "eu-north-1",
    "ap-south-1",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-east-1",
    "me-south-1",
    "sa-east-1",
    "ca-central-1",
  ];

  const timePeriod = {
    start,
    end,
  };

  const customerImpactQueries: CustomerImpactQuery[] = [];

  // Gather all the queries to run for each service component and region combination
  for (const region of regions) {
    for (const serviceComponent of serviceComponents) {
      const queries = await getCustomerImpactQueries(
        timePeriod,
        serviceComponent,
        region
      );

      customerImpactQueries.push(...queries);
    }
  }

  // Preflight CAZ
  await preflightCAZForAccountRoleCombinations(
    customerImpactQueries
      .map((customerImpactQuery) => {
        return customerImpactQuery.cazParams;
      })
      .flat()
  );

  // Execute all the queries in parallel
  const customerImpactOutputs: CustomerImpactOutput[] = (
    await Promise.all(
      customerImpactQueries.map((customerImpactQuery) => {
        return executeCustomerImpactQuery(customerImpactQuery);
      })
    )
  ).flat();

  writeOutput({
    customerImpactOutputs,
    ticket,
    serviceComponents,
    regions,
  });
};

const getCustomerImpactQueries = async (
  timePeriod: {
    start: string;
    end?: string;
  },
  serviceComponent: ServiceComponent,
  region: Region
): Promise<CustomerImpactQuery[]> => {
  const serviceComponentQueries = getServiceComponentQueries(
    serviceComponent,
    MetricType.Faults
  );

  const startDate = dayjs.utc(timePeriod.start).toDate();
  const endDate = timePeriod.end
    ? dayjs.utc(timePeriod.end).toDate()
    : new Date();

  const customerImpactQueries: CustomerImpactQuery[] = [];

  for (const serviceComponentQuery of serviceComponentQueries) {
    const { accountLookupFn, logGroupPrefixes, queryString, role, outputType } =
      serviceComponentQuery;

    const cazParams: CustomerImpactQuery["cazParams"] = [];

    const account = await accountLookupFn("prod", region);
    const cloudwatchLogsClient = getMemoizedCloudWatchLogsClient(
      region,
      account.accountId,
      role,
      {
        maxAttempts: 5,
      }
    );

    cazParams.push({
      account,
      role,
    });

    let dynamodbClient: DynamoDBDocumentClient | undefined;

    if (outputType === "appId") {
      const account = await controlPlaneAccount("prod", region);
      dynamodbClient = getMemoizedDynamoDBClient(
        region,
        account.accountId,
        StandardRoles.FullReadOnly
      );

      cazParams.push({
        account,
        role: StandardRoles.FullReadOnly,
      });
    }

    logGroupPrefixes.map((logGroupPrefix) => {
      customerImpactQueries.push({
        queryString,
        logGroupPrefix,
        startDate,
        endDate,
        outputType,
        serviceComponent,
        region,
        cloudwatchLogsClient,
        dynamodbClient,
        cazParams,
      });
    });
  }

  return customerImpactQueries;
};

const executeCustomerImpactQuery = async (
  customerImpactQuery: CustomerImpactQuery
): Promise<CustomerImpactOutput[]> => {
  const {
    queryString,
    logGroupPrefix,
    startDate,
    endDate,
    outputType,
    serviceComponent,
    region,
    cloudwatchLogsClient,
    dynamodbClient,
  } = customerImpactQuery;

  const logs = await insightsQuery(
    cloudwatchLogsClient,
    logGroupPrefix,
    queryString,
    startDate,
    endDate
  );

  if (logs.length === 0) {
    return [];
  }

  if (outputType === "accountId") {
    return logs.map((log) => {
      return {
        id: log.accountId,
        serviceComponent,
        region,
      };
    });
  }

  if (!dynamodbClient) {
    throw new Error(`DynamoDB client is required for appId output type`);
  }

  const accountIds = await mapAppIdsToCustomerAccountIds(
    logs.map((log) => log.appId),
    "prod",
    region,
    dynamodbClient
  );

  return accountIds.map((accountId) => {
    return {
      id: accountId,
      serviceComponent,
      region,
    };
  });
};

const writeOutput = ({
  customerImpactOutputs,
  ticket,
  serviceComponents,
  regions,
}: {
  customerImpactOutputs: CustomerImpactOutput[];
  ticket: string;
  serviceComponents: ServiceComponent[];
  regions: Region[];
}) => {
  const outputText: string[] = [];
  const regionalOutputText: string[] = [`\n`];

  for (const region of regions) {
    regionalOutputText.push(`**Customer impact in ${region}:**`);

    for (const serviceComponent of serviceComponents) {
      const customerAccountIds = [
        ...new Set(
          customerImpactOutputs
            .filter(
              (customerImpactOutput) =>
                customerImpactOutput.region === region &&
                customerImpactOutput.serviceComponent === serviceComponent
            )
            .map((customerImpactOutput) => customerImpactOutput.id)
        ),
      ];

      regionalOutputText.push(
        `Found ${customerAccountIds.length} customers impacted for ${serviceComponent}.`
      );

      writeCustomerImpactToOutputFile({
        customerAccountIds: [...new Set(customerAccountIds)],
        ticket,
        region,
        serviceComponent,
      });
    }

    regionalOutputText.push(`\n`);

    const customerAccountIds = [
      ...new Set(
        customerImpactOutputs
          .filter(
            (customerImpactOutput) => customerImpactOutput.region === region
          )
          .map((customerImpactOutput) => customerImpactOutput.id)
      ),
    ];

    outputText.push(
      `Found ${customerAccountIds.length} customers impacted in ${region}.`
    );

    // Write regional impact to output file
    writeCustomerImpactToOutputFile({
      customerAccountIds,
      ticket,
      region,
    });
  }

  // Write global impact to output file
  const customerAccountIds = [
    ...new Set(
      customerImpactOutputs.map(
        (customerImpactOutput) => customerImpactOutput.id
      )
    ),
  ];

  outputText.push(
    `Found ${customerAccountIds.length} customers impacted globally.`
  );

  writeCustomerImpactToOutputFile({
    customerAccountIds,
    ticket,
  });

  regionalOutputText.map((text) => logger.info(text));
  outputText.map((text) => logger.info(text));

  // Post comment to ticket
  postTicketComment(
    ticket,
    regionalOutputText.join("\n") + outputText.join("\n")
  );
};

const writeCustomerImpactToOutputFile = ({
  customerAccountIds,
  ticket,
  serviceComponent,
  region,
}: {
  customerAccountIds: string[];
  ticket: string;
  region?: Region;
  serviceComponent?: ServiceComponent;
}) => {
  /**
   * Output directory structure:
   *
   * - output/
   *  - <ticketId>/
   *   - <region>/
   *    - <service-component>-customer-impact.txt
   *   - <region>-customer-impact.txt
   *   - global-impact.txt
   *
   * E.g. output/P123456789/us-east-1/control-plane-customer-impact.txt
   * E.g. output/P123456789/us-east-1/build-trigger-customer-impact.txt
   * E.g. output/P123456789/us-east-1-customer-impact.txt
   * E.g. output/P123456789/global-impact.txt
   */
  customerAccountIds = [...new Set(customerAccountIds)];
  const output = customerAccountIds.join("\n");

  const isRegionalImpact = region && !serviceComponent;
  const isGlobalImpact = !region && !serviceComponent;

  const dir = isRegionalImpact ? "" : region ?? "";

  const outputDir = path.join(__dirname, "output", ticket, dir);

  const fileName = `${serviceComponent ? `${serviceComponent}-` : ""}${
    isGlobalImpact
      ? "global-"
      : `${isRegionalImpact ? `${region}-` : ""}customer-`
  }impact.txt`;

  const outputFile = path.join(outputDir, fileName);

  mkdirSync(outputDir, { recursive: true });

  logger.info(`Writing customer impact to ${outputFile}`);
  writeFileSync(outputFile, output);
};

const postTicketComment = async (ticket: string, comment: string) => {
  logger.info(
    `Posting customer impact to ticket: https://t.corp.amazon.com/${ticket}/communication`
  );
  const tickety = new TicketyService();
  await tickety.postTicketComment(ticket, comment);
};

main().then(console.log).catch(console.error);
