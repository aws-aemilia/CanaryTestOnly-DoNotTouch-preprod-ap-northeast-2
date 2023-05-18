import { ResourceNotFoundException } from "@aws-sdk/client-dynamodb";
import { DomainDO } from "../types";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

/**
 * Checks in the domain table to determine if a domain exists with the
 * given domainId. Returns true if it does, false otherwise.
 *
 * @param dynamodb Document Client from @aws-sdk/lib-dynamodb
 * @param stage i.e. beta, gamma, prod
 * @param region i.e. us-west-2
 * @param domainId The appId to lookup
 *
 * @returns true or false
 */
export const checkDomainExists = async (
  dynamodb: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainId: string
): Promise<boolean> => {
  try {
    console.log("Looking up domain in Domain table", domainId);
    const queryResponse = await dynamodb.send(
      new QueryCommand({
        TableName: `${stage}-${region}-Domain`,
        IndexName: "domainId-index",
        ProjectionExpression: "domainId",
        KeyConditionExpression: "domainId = :domainId",
        ExpressionAttributeValues: {
          ":domainId": domainId,
        },
      })
    );

    if (!queryResponse.Items || queryResponse.Items.length === 0) {
      console.log("Domain not found", domainId);
      return false;
    }

    console.log("Domain exists", domainId);
    return true;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      console.log("Domain not found", domainId);
      return false;
    } else {
      console.error("Failed to lookup domain", domainId);
      throw err;
    }
  }
};

/**
 * Queries the Domain table with the given domainName. Returns null if not found
 *
 * @param documentClient DocumentClient with credentials for the Control Plane account
 * @param stage The stage to find the App in
 * @param region The region to find the App in
 * @param domainName The domain to find. Note that it must be the root domain, not a subdomain
 */
export const findDomain = async (
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainName: string
): Promise<DomainDO | null> => {
  try {
    const response = await documentClient.send(
      new QueryCommand({
        TableName: `${stage}-${region}-Domain`,
        KeyConditionExpression: "domainName = :domainName",
        IndexName: "domain-domain-name-gsi-index",
        ExpressionAttributeValues: {
          ":domainName": domainName,
        },
      })
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    // The assumption is that there is only 1 domain name. This is true because
    // we enforce that there can only be 1 record in Control Plane across all apps.
    return response.Items[0] as DomainDO;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return null;
    }
    throw err;
  }
};

/**
 * Queries Domain table with the given appId and domainName. Returns null if not found
 *
 * @param documentClient DocumentClient with credentials for the Control Plane account
 * @param stage The stage to find the App in
 * @param region The region to find the App in
 * @param appId The appId that the domain belongs to
 * @param domainName The domain to find. Note that it must be the root domain, not a subdomain
 */
export const getDomain = async (
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  appId: string,
  domainName: string
): Promise<DomainDO | null> => {
  try {
    const response = await documentClient.send(
      new GetCommand({
        TableName: `${stage}-${region}-Domain`,
        Key: {
          appId,
          domainName,
        },
      })
    );

    if (!response.Item) {
      return null;
    }

    return response.Item as DomainDO;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return null;
    }
    throw err;
  }
};

// The GSI domainId-index does not project all attributes of the DomainDO,
// it only projects the following 3:
interface GetDomainByIdOutput {
  domainId: string;
  domainName: string;
  appId: string;
}

/**
 * Queries the Domain table with the given domainId. Returns null if not found
 *
 * @param documentClient DocumentClient with credentials for the Control Plane account
 * @param stage The stage to find the App in
 * @param region The region to find the App in
 * @param domainId The domainId to find. i.e. d1234567890abcdef
 */
export const findDomainById = async (
  documentClient: DynamoDBDocumentClient,
  stage: string,
  region: string,
  domainId: string
): Promise<GetDomainByIdOutput | null> => {
  try {
    const response = await documentClient.send(
      new QueryCommand({
        TableName: `${stage}-${region}-Domain`,
        KeyConditionExpression: "domainId = :domainId",
        IndexName: "domainId-index",
        ExpressionAttributeValues: {
          ":domainId": domainId,
        },
      })
    );

    if (!response.Items || response.Items.length === 0) {
      return null;
    }

    return response.Items[0] as GetDomainByIdOutput;
  } catch (err) {
    if (err instanceof ResourceNotFoundException) {
      return null;
    }
    throw err;
  }
};
