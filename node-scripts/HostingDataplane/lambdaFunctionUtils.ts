import {
  LambdaClient,
  GetFunctionCommand,
  GetFunctionCommandOutput,
  PublishVersionCommand,
  CreateFunctionCommand,
  waitUntilFunctionExists,
  waitUntilFunctionActive,
  UpdateFunctionConfigurationCommand,
  waitUntilFunctionUpdatedV2,
  paginateListVersionsByFunction,
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
 * @param {string} functionName The Function Name
 * @param {string} version The version to be published
 * @param {LambdaClient} lambdaClient The AWS Lambda client
 * @return {*}  {(Promise<string>)}
 */
export const publishLambdaVersion = async (
  functionName: string,
  lambdaClient: LambdaClient
): Promise<string> => {
  console.log(`Publishing new version for Lambda function: ${functionName}`);

  const currentVersion = await getLatestLambdaFunctionVersion(
    lambdaClient,
    functionName
  );
  const newVersion = currentVersion + 1;

  const updateFunctionConfigurationRequest =
    new UpdateFunctionConfigurationCommand({
      FunctionName: functionName,
      Description: `Version ${newVersion} of the Lambda function ${functionName}`,
    });

  await lambdaClient.send(updateFunctionConfigurationRequest);

  console.log(
    `Updating function configuration before publishing new version for ${functionName}`
  );

  await waitUntilFunctionUpdatedV2(
    {
      client: lambdaClient,
      maxWaitTime: LAMBDA_WAIT_TIME,
    },
    {
      FunctionName: functionName,
    }
  );

  const publishVersionCommand = new PublishVersionCommand({
    FunctionName: functionName,
    Description: `Version ${newVersion} of the Lambda function ${functionName}`,
  });

  const publishVersionCommandOutput = await lambdaClient.send(
    publishVersionCommand
  );

  if (!publishVersionCommandOutput.FunctionArn) {
    throw new Error("Published version does not contain FunctionArn");
  }

  console.log(`New version successfully published: ${newVersion}`);

  return publishVersionCommandOutput.FunctionArn;
};

/**
 * Clones the given Lambda function to the given name if it doesn't exist already. Returns the existing one if it does.
 *
 * @param {string} functionArn The original function to clone from
 * @param {string} functionCloneName The intended name of the cloned function
 * @param {LambdaClient} lambdaClient
 * @return {*}  {Promise<string>} The function ARN of the cloned function along with the version
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
    const clonedFunctionArn = clonedFunction.Configuration.FunctionArn;
    const clonedFunctionVersion = await getLatestLambdaFunctionVersion(
      lambdaClient,
      clonedFunctionArn
    );
    return `${clonedFunctionArn}:${clonedFunctionVersion}`;
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

  const clonedFunctionVersion = await getLatestLambdaFunctionVersion(
    lambdaClient,
    clonedFunctionArn
  );

  console.info(`Cloned function version: ${clonedFunctionVersion}`);
  console.info(`Function clone is now active.`);

  return `${clonedFunctionArn}:${clonedFunctionVersion}`;
};

const getLatestLambdaFunctionVersion = async (
  lambdaClient: LambdaClient,
  functionArn: string
) => {
  const functionVersions: number[] = [];
  for await (const page of paginateListVersionsByFunction(
    { client: lambdaClient },
    {
      FunctionName: functionArn,
    }
  )) {
    page.Versions?.filter((version) => version.Version !== "$LATEST").forEach(
      (version) => {
        if (!version.Version) {
          return;
        }
        functionVersions.push(parseInt(version.Version));
      }
    );
  }
  console.log(`Found versions: ${functionVersions}`);
  return functionVersions.sort()[functionVersions.length - 1];
};
