import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Credentials } from "../../types";
import { accounts } from "../../utils";
import Isengard from "../../utils/isengardCreds";
import { DynamoDBAttributeName } from "../types";

export const getArgs = () => {
  let args = process.argv;
  args = args.splice(2);

  if (!Array.isArray(args) || args.length < 2) {
    throw new Error("Invalid flags provided to migration script");
  }

  return args;
};

export const getArg = (argName: string, args: string[]) => {
  const argString = args.find((arg) => arg.includes(`--${argName}`));

  if (!argString) {
    throw new Error(`${argName} flag not provided`);
  }

  const argParts = argString.split(`--${argName}=`);

  if (!Array.isArray(argParts) || argParts.length !== 2) {
    throw new Error(`${argName} flag malformed`);
  }

  const arg = argParts[1];

  if (!arg) {
    throw new Error(`${argName} not provided`);
  }

  return arg;
};

export const getRegion = (args: string[]) => {
  const region = getArg("region", args);

  if (!accounts.some((account) => account.region === region)) {
    throw new Error(`Invalid region provided: ${region}`);
  }

  return region;
};

export const getStage = (args: string[]) => {
  const stage = getArg("stage", args);

  if (!["prod", "preprod", "gamma", "beta", "test"].includes(stage)) {
    throw new Error(`Invalid stage provided: ${stage}`);
  }

  return stage;
};

export const getAction = (args: string[]) => {
  const action = getArg("action", args);

  if (!["migrate", "rollback"].includes(action)) {
    throw new Error(`Invalid action provided: ${action}`);
  }

  return action;
};

export const getAppId = (args: string[]) => {
  let appId;

  try {
    appId = getArg("app-id", args);
  } catch (err) {
    console.warn("App ID not provided. Migration will occur for all apps");
  }

  return appId;
};

export const getAccount = (region: string, stage: string) => {
  const account = accounts.find(
    (account) => account.region === region && account.stage === stage
  );

  if (!account) {
    throw new Error(
      `Account not found for region: ${region} and stage: ${stage}`
    );
  }

  return account;
};

export const getCredentials = async (
  accountId: string,
  stage: string,
  roleName?: string
) => {
  roleName = roleName || stage === "prod" ? "OnCallOperator" : "Admin";
  const credentials = await Isengard.getCredentials(accountId, roleName);

  if (!credentials) {
    throw new Error("Failed to get isengard creds");
  }

  return credentials;
};

export const getDdbClient = (region: string, credentials: Credentials) => {
  const ddb = new DynamoDBClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      expiration: new Date(credentials.expiration),
    },
  });
  const ddbClient = DynamoDBDocumentClient.from(ddb);

  return ddbClient;
};

export const getAttributeName = (attribute: string) => {
  let attributeName: string;
  let ExpressionAttributeNames: DynamoDBAttributeName["ExpressionAttributeNames"];

  if (attribute.includes(".")) {
    const subAttrs = attribute.split(".");

    attributeName = subAttrs.map((a, i) => `#attribute_name${i}`).join(".");
    ExpressionAttributeNames = subAttrs.reduce((map, a, i) => {
      return {
        ...map,
        [`#attribute_name${i}`]: a,
      };
    }, {});
  } else {
    attributeName = "#attribute_name";
    ExpressionAttributeNames = {
      [`${attributeName}`]: attribute,
    };
  }

  return { attributeName, ExpressionAttributeNames } as DynamoDBAttributeName;
};
