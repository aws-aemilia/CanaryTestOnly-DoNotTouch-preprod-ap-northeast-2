import {
  LambdaClient,
  GetFunctionCommand,
  GetFunctionCommandOutput,
  PublishVersionCommandOutput,
  PublishVersionCommand,
  CreateFunctionCommand,
  waitUntilFunctionExists,
  waitUntilFunctionActive,
} from "@aws-sdk/client-lambda";
import axios from "axios";

export const LAMBDA_WAIT_TIME = 300;

export const getFunction = async (
  functionNameOrArn: string,
  lambdaClient: LambdaClient,
  qualifier?: string
): Promise<GetFunctionCommandOutput | undefined> => {
  const getFunctionCommand = new GetFunctionCommand({
    FunctionName: functionNameOrArn,
    Qualifier: qualifier,
  });

  let functionOutput;

  try {
    functionOutput = await lambdaClient.send(getFunctionCommand);
  } catch (ex) {
    if ((ex as Error).name === "ResourceNotFoundException") {
      return;
    }
    throw ex;
  }

  return functionOutput;
};

export const getFunctionCodeLocation = (
  functionArn: string,
  functionOutput: GetFunctionCommandOutput
): string => {
  const { Code } = functionOutput;

  if (!Code) {
    throw new Error(`No code found for Lambda function ${functionArn}`);
  }

  const { RepositoryType, Location } = Code;

  if (!RepositoryType || RepositoryType != "S3") {
    throw new Error(`Code is not in S3 for Lambda function ${functionArn}`);
  }

  if (!Location) {
    throw new Error(
      `Code location is not defined for Lambda function ${functionArn}`
    );
  }

  return Location;
};

export const getCodeZip = async (functionCodeLocation: string) => {
  const response = await axios.get(functionCodeLocation, {
    responseType: "arraybuffer",
  });
  return response.data as Uint8Array;
};

/**
 * Publishes the given version of a Lambda function if it doesn't exist already. Returns `PublishVersionCommandOutput` if
 * a new version was published and `undefined` if the version exists already
 *
 * @param {string} functionNameOrArn The Function ARN or name
 * @param {string} version The version to be published
 * @param {LambdaClient} lambdaClient The AWS Lambda client
 * @return {*}  {(Promise<PublishVersionCommandOutput | undefined>)}
 */
export const publishLambdaVersion = async (
  functionNameOrArn: string,
  version: string,
  lambdaClient: LambdaClient
): Promise<PublishVersionCommandOutput | undefined> => {
  const rollbackCloneVersion = await getFunction(
    functionNameOrArn,
    lambdaClient,
    version
  );

  if (
    rollbackCloneVersion?.Configuration?.FunctionArn &&
    rollbackCloneVersion.Configuration.Version === version
  ) {
    console.log(
      `Lambda function version ${functionNameOrArn}:${version} exists already. Skipping publishing the version.`
    );
    return;
  }

  const publishVersionCommand = new PublishVersionCommand({
    FunctionName: functionNameOrArn,
  });

  return lambdaClient.send(publishVersionCommand);
};

/**
 * Clones the given Lambda function to the given name if it doesn't exist already. Returns the existing one if it does.
 *
 * @param {string} functionArn The original function to clone from
 * @param {string} functionCloneName The intended name of the cloned function
 * @param {LambdaClient} lambdaClient
 * @return {*}  {Promise<string>} The function ARN of the cloned function
 */
export const getOrCloneLambdaFunction = async (
  functionArn: string,
  functionCloneName: string,
  lambdaClient: LambdaClient
): Promise<string> => {
  const clonedFunction = await getFunction(functionCloneName, lambdaClient);

  if (clonedFunction?.Configuration?.FunctionArn) {
    console.info(
      `Function clone ${functionCloneName} exists already. Skipping creation`
    );
    return clonedFunction.Configuration.FunctionArn;
  }

  const originalFunction = await getFunction(functionArn, lambdaClient);

  if (!originalFunction) {
    throw new Error(
      `Original function ${functionArn} not found. Unable to clone.`
    );
  }

  console.info(`Pulling code from replication function ${functionArn}...`);

  const functionCodeLocation = getFunctionCodeLocation(
    functionArn,
    originalFunction
  );
  const { Configuration: originalFunctionConfiguration } = originalFunction;

  if (!originalFunctionConfiguration) {
    throw new Error(`Function configuration not found for ${functionArn}`);
  }

  let codeZip: Uint8Array;

  try {
    codeZip = await getCodeZip(functionCodeLocation);
  } catch (e) {
    console.error(e);
    throw new Error(`Unable to download function code for ${functionArn}`);
  }

  console.info(`Pulled code from original function ${functionArn}.`);

  const {
    DeadLetterConfig,
    Handler,
    KMSKeyArn,
    MemorySize,
    Role,
    Runtime,
    Timeout,
  } = originalFunctionConfiguration;

  console.info(`Create new clone: ${functionCloneName}...`);

  const createFunctionCommand = new CreateFunctionCommand({
    FunctionName: functionCloneName,
    Description: `Clone of ${functionArn}`,
    Code: {
      ZipFile: codeZip,
    },
    DeadLetterConfig,
    Handler,
    KMSKeyArn,
    MemorySize,
    Publish: true,
    Role,
    Runtime,
    Timeout,
  });

  const createFunctionOutput = await lambdaClient.send(createFunctionCommand);

  const { FunctionArn: clonedFunctionArn } = createFunctionOutput;

  if (!clonedFunctionArn) {
    throw new Error(`Function clone was not created for ${functionArn}`);
  }

  console.info(`Function clone created: ${clonedFunctionArn}.`);

  console.info(`Waiting for clone to become active...`);

  await waitUntilFunctionExists(
    {
      client: lambdaClient,
      maxWaitTime: LAMBDA_WAIT_TIME,
    },
    {
      FunctionName: clonedFunctionArn,
    }
  );

  await waitUntilFunctionActive(
    {
      client: lambdaClient,
      maxWaitTime: LAMBDA_WAIT_TIME,
    },
    {
      FunctionName: clonedFunctionArn,
    }
  );

  console.info(`Function clone is now active.`);

  return clonedFunctionArn;
};
