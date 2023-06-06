import {
  CloudFormationClient,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

export const getCloudFormationOutput = async (
  client: CloudFormationClient,
  stackName: string,
  outputKey: string
): Promise<string | undefined> => {
  console.log("Fetching CloudFormation stack", stackName);
  const describeResponse = await client.send(
    new DescribeStacksCommand({
      StackName: stackName,
    })
  );

  const stack = describeResponse.Stacks?.find(
    (stack) => stack.StackName === stackName
  );
  if (!stack) {
    console.log("CloudFormation stack not found", stack);
    return undefined;
  }

  const output = stack.Outputs?.find(
    (output) => output.OutputKey === outputKey
  );
  if (!output) {
    console.log("CloudFormation stack output not found", stackName, outputKey);
    return undefined;
  }

  console.log(
    `CloudFormation stack output ${outputKey} found = ${output.OutputValue}`
  );
  return output.OutputValue;
};
