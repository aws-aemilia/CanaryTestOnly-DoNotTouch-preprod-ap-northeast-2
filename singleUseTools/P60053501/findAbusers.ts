// Script to find abuses of https://t.corp.amazon.com/P60053501/communication

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  GetCommandOutput,
  ScanCommand,
  ScanCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import { AWSError } from "aws-sdk";

import serviceAccounts from "../../commons/utils/static/accounts.json";
import sleep from "../../commons/utils/sleep";
import { getIsengardCredentialsProvider } from "../../commons/Isengard";

function getAccountIdFromRoleArn(roleArn: string): string | null {
  const regex = new RegExp(/[0-9]+:role/g);
  const result = regex.exec(roleArn);

  if (!result) {
    return null;
  }

  const parts = result[0].split(":");

  if (!parts || parts.length === 1) {
    return null;
  }

  return parts[0];
}

async function main() {
  for await (const serviceAccount of serviceAccounts) {
    console.log(`============ ${serviceAccount.region} ===========`);

    const { account, region } = serviceAccount;
    const ddb = new DynamoDBClient({
      region: region,
      credentials: getIsengardCredentialsProvider(account),
    });

    const dynamodb = DynamoDBDocumentClient.from(ddb);
    let lastEvaluatedKey = undefined;
    const domains: any[] = [];

    do {
      const data: ScanCommandOutput = await dynamodb.send(
        new ScanCommand({
          TableName: `prod-${region}-Domain`,
          ExclusiveStartKey: lastEvaluatedKey ?? undefined,
          FilterExpression:
            "attribute_exists(autoSubdomainIAMRole) " +
            "and contains(autoSubdomainIAMRole, :containsStr)",
          ExpressionAttributeValues: {
            ":containsStr": "arn",
          },
          Limit: 1000,
        })
      );

      lastEvaluatedKey = data.LastEvaluatedKey;
      console.log(`Scan returned ${data.Count} domains`);

      if (data.Items) {
        domains.push(
          ...data.Items.map((item) => ({
            appId: item.appId,
            domainName: item.domainName,
            autoSubdomainIAMRole: item.autoSubdomainIAMRole,
          }))
        );
      }

      await sleep(250);
    } while (lastEvaluatedKey !== undefined);

    console.log(`Looking up apps now`);

    // Find corresponding apps
    for await (const domain of domains) {
      await sleep(50);
      try {
        const data: GetCommandOutput = await dynamodb.send(
          new GetCommand({
            TableName: `prod-${region}-App`,
            Key: {
              appId: domain.appId,
            },
          })
        );

        if (data.Item) {
          const app = data.Item;
          const ownerAccountId = app.accountId;
          const roleAccountId = getAccountIdFromRoleArn(
            domain.autoSubdomainIAMRole
          );

          if (ownerAccountId !== roleAccountId) {
            console.log(
              app.appId,
              ownerAccountId,
              roleAccountId,
              domain.domainName,
              domain.autoSubdomainIAMRole
            );
          } else {
            console.log(`${domain.domainName} role matches owner. All good`);
          }
        }
      } catch (err) {
        const exception = err as AWSError;
        if (exception.statusCode === 404) {
          console.log(`AppId ${domain.appId} no longer exists`);
        } else {
          throw err;
        }
      }
    }
  }
}

main();
