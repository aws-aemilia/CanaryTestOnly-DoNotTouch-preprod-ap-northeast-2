/**
 * This is a single-use Ops script used to gather 3rd-party custom domains (i.e. domains not registered through Route53)
 * which had misconfigured Certificate Authority Authorization (CAA) records. For more info, see:
 * - https://t.corp.amazon.com/D86684700
 * - https://t.corp.amazon.com/V939568947
 */
import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
  Stage,
  StandardRoles,
} from "../../Commons/Isengard";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  lookupCustomerAccountId,
  paginateDomains,
} from "../../Commons/dynamodb";
import { RegionName } from "aws-sdk/clients/appstream";
import { stringify } from "csv-stringify/sync";
import fs from "fs";

type DomainInfo = {
  domainName: string;
  appId: string;
  customerAccountId?: string;
};

type DigResponse = {
  answer: { type: string; value: string }[];
};

const isAmazonCA = (ca: string) =>
  ["amazon.com", "amazontrust.com", "awstrust.com", "amazonaws.com"].includes(
    ca
  );

function hasAmazonCAs(cas: string[]) {
  return cas.filter(isAmazonCA).length > 0;
}

function getDocumentClient(account: AmplifyAccount) {
  const credentials = getIsengardCredentialsProvider(
    account.accountId,
    StandardRoles.FullReadOnly
  );

  const dynamoDB = new DynamoDBClient({
    region: account.region,
    credentials,
  });

  return DynamoDBDocumentClient.from(dynamoDB);
}

/**
 * List all the custom domains within a given stage and region. We need the appId to look up the customer account ID,
 * and the status to determine whether the domain is actually active.
 */
async function listDomains(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: RegionName
) {
  const domainName = "domainName",
    appId = "appId",
    status = "#s";
  const domains: DomainInfo[] = [];
  const paginatedDomains = paginateDomains(
    documentClient,
    stage,
    region,
    [domainName, appId, status],
    { "#s": "status" } // An expression attribute is used here because "status" is a DynamoDB protected keyword
  );

  const isAvailable = (item: Record<string, any>) =>
    item["status"] === "AVAILABLE";
  const extractFields = (item: Record<string, any>): DomainInfo => ({
    domainName: item[domainName],
    appId: item[appId],
  });

  for await (const page of paginatedDomains) {
    const retrievedItems =
      page.Items?.filter(isAvailable).map(extractFields) ?? [];
    domains.push(...retrievedItems);
  }
  return domains;
}

function getCAs(digResponse: DigResponse): string[] {
  const isCAARecord = (item: { type: string }) => item.type === "CAA";
  // The dig response has extraneous quotation marks at the beginning and end of the CA URL.
  const removeQuotes = (item: { value: string }) => item.value.replace('"', "");

  return digResponse.answer?.filter(isCAARecord).map(removeQuotes) ?? [];
}

/**
 * Get all the custom domains with misconfigured CAA records using the `dig` command, and look up the account ID of
 * each such domain for customer reachouts.
 */
async function getMisconfiguredDomains(
  documentClient: DynamoDBDocumentClient,
  stage: Stage,
  region: RegionName,
  domains: DomainInfo[]
) {
  const dig = require("node-dig-dns");
  let misconfiguredDomains: DomainInfo[] = [];

  for (const domain of domains) {
    let digResponse;
    try {
      digResponse = await dig([domain.domainName, "CAA"]);
    } catch (e) {
      continue;
    }
    const cas = getCAs(digResponse);

    if (cas?.length > 0 && !hasAmazonCAs(cas)) {
      domain.customerAccountId =
        (await lookupCustomerAccountId(
          documentClient,
          stage,
          region,
          domain.appId
        )) ?? undefined;
      misconfiguredDomains.push(domain);
    }
  }

  return misconfiguredDomains;
}

async function main() {
  const accounts = await controlPlaneAccounts({ stage: "prod" });

  for (const account of accounts) {
    const documentClient = getDocumentClient(account);

    const domains = await listDomains(
      documentClient,
      account.stage as Stage,
      account.region
    );
    let misconfiguredDomains = await getMisconfiguredDomains(
      documentClient,
      account.stage as Stage,
      account.region,
      domains
    );

    const csv = stringify(
      misconfiguredDomains.map((item: DomainInfo) => [
        account.region,
        item.domainName,
        item.appId,
        item.customerAccountId,
      ])
    );
    fs.appendFileSync("misconfiguredDomains.csv", csv);
  }
}

main().catch(console.error);
