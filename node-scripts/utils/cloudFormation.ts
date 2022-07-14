import {
  CloudFormationClient,
  DescribeStacksCommand,
  DescribeStacksCommandOutput,
} from "@aws-sdk/client-cloudformation";
import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";
import { memoizeWith } from "ramda";

export const fetchCloudFormationOutputs = async ({
  amplifyAccount,
  stackName,
  outputKeys,
}: {
  amplifyAccount: AmplifyAccount;
  stackName: string;
  outputKeys: string[];
}) => {
  const client = new CloudFormationClient({
    region: amplifyAccount.region,
    credentials: getIsengardCredentialsProvider(amplifyAccount.accountId),
  });

  const command = new DescribeStacksCommand({ StackName: stackName });
  const describeStacksCommandOutput: DescribeStacksCommandOutput =
    await client.send(command);

  return describeStacksCommandOutput
    .Stacks![0].Outputs!.filter((x) => outputKeys.includes(x.OutputKey!))
    .reduce((acc, output) => {
      acc[output.OutputKey!] = output.OutputValue!;
      return acc;
    }, {} as Record<string, string>);
};

/**
 * Fetch outputs from a given CFN stack
 * @param options
 * @param options.amplifyAccount The AWS account where the CFN stack is located
 * @param options.stackName
 * @param options.outputKeys The CFN output keys to fetch
 */
export const getCloudFormationOutputs = memoizeWith(
  ({ amplifyAccount, stackName, outputKeys }) => `${amplifyAccount.accountId}|${stackName}|${outputKeys.join('#')}`,
  fetchCloudFormationOutputs
);
