import yargs from "yargs";
import pino from "pino";
import pinoPretty from "pino-pretty";
import { createCategorization, TicketyService } from "./Tickety";
import { TicketData } from "@amzn/tickety-typescript-sdk";

const logger = pino(pinoPretty());

/**
 * Example Usage:
 * npx ts-node vCPULimitIncrease.ts \
    --stage prod \
    --region us-west-2 \
    --accountId 123456789012 \
    --limit 16000 \
    --ticket D1234567 \
 */
const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(`Cut limit increase ticket for vCPU.`)
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      default: "prod",
      choices: ["beta", "gamma", "preprod", "prod"],
    })
    .option("region", {
      describe: "region to run the command",
      type: "string",
      default: "us-east-1",
      demandOption: true,
    })
    .option("accountId", {
      describe: "account to run the command",
      type: "string",
      demandOption: true,
    })
    .option("limit", {
      describe: "vCPU limit to request",
      type: "string",
      demandOption: true,
    })
    .option("ticket", {
      describe: "i.e. D69568945. Used for Contingent Auth",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region, accountId, limit, ticket } = args;
  process.env.ISENGARD_SIM = ticket;

  logger.info(
    `Creating vCPU limit increase ticket for { AccountId: ${accountId}, Region: ${region}, Limit: ${limit}, Stage: ${stage} }`
  );

  const usecase =
    stage === "prod"
      ? "AWS Amplify Hosting Gateway uses Fargate containers for our compute and we need a limit increase for vCPU"
      : "My team, AWS Amplify Hosting, is build a Hosting gateway and I need to run some load tests in my account.";

  const description = `IMPORTANT PLEASE READ BELOW
1. This CTI is for Fargate vCPU resource count, On-Demand or Spot, SLIs. For more information on our quotas: https://tiny.amazon.com/1jzstang5/AWSFargateQuotas
2. Fargate Team gets a high volume of SLIs per day. Our current SLA is 3 business days
3. DO NOT RAISE SEV-2 to gain traction. If we have crossed SLA and/or customer has production pain, please ping our secondary oncall - https://tiny.amazon.com/cfz5w3y9/oncacorpamazviewawsssche
4. Ensure ALL applicable information requested below is filled to avoid delays
5. Bulk limit increases are not supported by our tooling at the moment. Please cut us a ticket for each account requiring an SLI
6. More than one region can be mentioned in ticket, for single account ID, separate by comma in the Region section

We use a tool to help process limit increases, so for timely handling, please ensure the following:
1. DO NOT modify the template or remove ANY fields
2. DO NOT leave any required fields empty. If unsure, ask customer for more information 
3. Put the response to the field on the SAME LINE as the question - right after the colon
4. Verify the ticket is set to Public

Please see this example ticket weve made to illustrate a valid request: https://t.corp.amazon.com/P75763148
_________________
REQUIRED FIELDS:
1. AWS ID only ONE account per ticket: ${accountId}
2. Region only Airport Code: ${region}
3. On-Demand OR Spot only ONE type per ticket: On-Demand
4. Requested Limit Value: ${limit}
5. Brief use case or reason for the requested limit increase: ${usecase}

ADDITIONAL FIELDS required if requested limit value is higher than 1,000 vCPU count:
1. Expected distribution of task sizes in terms of vCPU and Memory Example: 100% are 2vCPU 4 GB memory:
    A:  We plan to potentially increase this up to 100% 16vCPU and 32GB
2. Does customer follow best practice of spreading workload across all availability zones for higher availability Y or N: 
    A: Y
3. If not, which AZs will be targeted: 
    A: NA`;

  const ticketData: TicketData = {
    title: "Fargate Resource Limit Increase | INTERNAL Account",
    description,
    severity: stage === "prod" ? "SEV_3" : "SEV_4",
    categorization: createCategorization(
      "AWS",
      "ECS Fargate",
      "Limit Increase"
    ),
  };
  const ticketyService = new TicketyService();
  const ID = await ticketyService.createTicket(ticketData);

  logger.info(`\nTicket created: ${ID}`);
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
