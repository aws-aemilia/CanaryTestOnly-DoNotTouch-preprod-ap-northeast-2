import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
} from "@aws-sdk/client-service-quotas";
import yaml from "js-yaml";
import fs from "fs";
import Isengard from "./utils/isengard";

// This script is useful to fetch the current Lambda Concurrency quota that we have on 
// each region per production account. Since we use Lambda@Edge and it consumes Lambda 
// capacity from 13 regions. We need to track Lambda usage across all those regions, 
// not only the region where Amplify is deployed. This means we need to track
// 19 accounts * 13 l@e regions = 247 different quotas. This script automates the task 
// of pulling those values using the Service Quotas API. 

// To run it, simply run brazil-build current-lambda-limits.
// It produces a YAML file at the end with all the values. 
// The script automatically gets credentials from Isengard for each account. So, make 
// sure you have a valid midway token when running it. `midway -o`

interface AmplifyAccount {
  region: string;
  accountId: string;
}

const accounts: AmplifyAccount[] = [
  { region: "eu-west-2", accountId: "499901155257" },
  { region: "us-east-2", accountId: "264748200621" },
  { region: "ap-southeast-1", accountId: "148414518837" },
  { region: "eu-west-1", accountId: "565036926641" },
  { region: "us-east-1", accountId: "073653171576" },
  { region: "ap-northeast-1", accountId: "550167628141" },
  { region: "ap-northeast-2", accountId: "024873182396" },
  { region: "ap-south-1", accountId: "801187164913" },
  { region: "ap-southeast-2", accountId: "711974673587" },
  { region: "eu-central-1", accountId: "644397351177" },
  { region: "us-west-2", accountId: "395333095307" },
  { region: "ca-central-1", accountId: "824930503114" },
  { region: "eu-north-1", accountId: "315276288780" },
  { region: "eu-west-3", accountId: "693207358157" },
  { region: "sa-east-1", accountId: "068675532419" },
  { region: "us-west-1", accountId: "214290359175" },
  { region: "eu-south-1", accountId: "804516649577" },
  { region: "ap-east-1", accountId: "574285171994" },
  { region: "me-south-1", accountId: "183380703454" },
];

const lambdaEdgeRegions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "eu-west-1",
  "eu-west-2",
  "eu-central-1",
  "sa-east-1",
];

async function main() {
  const limits: any = {};
  const concurrencyQuotaCode = "L-B99A9384";

  for await (const account of accounts) {
    console.log("Fetching credentials for", account.accountId);
    const credentials = await Isengard.getCredentials(account.accountId);
    if (!credentials) {
      throw new Error("Failed to get isengard creds");
    }

    // Add accountId to the response
    limits[account.accountId] = {};

    // Regions to fetch lambda quota from: 
    // - All regions where lambda@edge consumes capacity
    // - But also the Amplify region itself for this corresponding account
    const regions = new Set([account.region, ...lambdaEdgeRegions]);

    for await (const region of regions) {
      const quotas = new ServiceQuotasClient({
        region,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          sessionToken: credentials.sessionToken,
          expiration: new Date(credentials.expiration),
        },
      });

      console.log("Fetching quota for", region);
      const response = await quotas.send(
        new GetServiceQuotaCommand({
          ServiceCode: "lambda",
          QuotaCode: concurrencyQuotaCode,
        })
      );

      if (!response.Quota || !response.Quota.Value) {
        console.log("Quota not found for region", region);
        continue;
      }

      // Add region limit to the response object
      limits[account.accountId][region] = response.Quota.Value;
    }
  }

  const result = yaml.dump(limits);
  fs.writeFileSync("currentLambdaLimits.yml", result);
  console.log("Done");
}

main();
