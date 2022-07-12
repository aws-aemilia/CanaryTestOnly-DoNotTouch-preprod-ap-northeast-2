import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
} from "../../../../Isengard";
import { getCloudFormationOutputs } from "../../../../utils/cloudFormation";
import {
  DescribeListenersCommand,
  DescribeRulesCommand,
  ElasticLoadBalancingV2Client,
  ModifyRuleCommand,
  Rule,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { SecretStore } from "./types";
import { partial } from "ramda";

const isForwardToCellGatewayServiceRule = (rule: Rule): boolean => {
  return (
    !!rule.Actions?.find((action) => action.Type === "forward") &&
    !!rule.Conditions?.find(
      (condition) =>
        condition.HttpHeaderConfig?.HttpHeaderName ===
        "x-amplify-origin-verify-header"
    )
  );
};

const findCellGatewayLoadBalancerArn = async (
  cellAccount: AmplifyAccount
): Promise<string> => {
  const { stage } = cellAccount;
  const stackName = `ComputeServiceCellGateway-${stage}`;

  const outputs = await getCloudFormationOutputs({
    amplifyAccount: cellAccount,
    outputKeys: ["CellGatewayLoadBalancerArn"],
    stackName,
  });

  if (outputs.CellGatewayLoadBalancerArn === undefined) {
    throw new Error(
      `The CellGatewayLoadBalancerArn key is not found in the outputs of ${stackName}`
    );
  }

  return outputs.CellGatewayLoadBalancerArn;
};

const getListenerArn = async (
  elbClient: ElasticLoadBalancingV2Client,
  cellGatewayLoadBalancerArn: string
): Promise<string> => {
  const { Listeners } = await elbClient.send(
    new DescribeListenersCommand({
      LoadBalancerArn: cellGatewayLoadBalancerArn,
    })
  );

  if (Listeners === undefined || Listeners.length === 0) {
    throw new Error(
      `There are no listeners for  ${cellGatewayLoadBalancerArn}`
    );
  }

  if (Listeners.length > 1) {
    throw new Error(
      `There are multiple listeners for ${cellGatewayLoadBalancerArn}. This is unexpected`
    );
  }

  return Listeners[0].ListenerArn!;
};

export const readSecretsFromELB = async (
  priority: string,
  cellAccount: AmplifyAccount
) => {
  const { region } = cellAccount;
  const cellGatewayLoadBalancerArn = await findCellGatewayLoadBalancerArn(
    cellAccount
  );

  const elbClient = new ElasticLoadBalancingV2Client({
    region,
    credentials: getIsengardCredentialsProvider(cellAccount.accountId),
  });

  const listenerArn = await getListenerArn(
    elbClient,
    cellGatewayLoadBalancerArn
  );

  const describeRulesCommandOutput = await elbClient.send(
    new DescribeRulesCommand({ ListenerArn: listenerArn })
  );

  const secretRule = describeRulesCommandOutput
    .Rules!.filter(isForwardToCellGatewayServiceRule)
    .find((rule) => rule.Priority === priority);

  const secretValue = secretRule?.Conditions?.[0].HttpHeaderConfig?.Values?.[0];

  return secretValue
    ? {
        value: secretValue,
        meta: `${cellAccount.email} - ELB priority:${secretRule!.Priority} ${
          secretRule!.RuleArn
        }`,
      }
    : {
        meta: `${cellAccount.email} - ELB priority:${
          secretRule?.Priority ?? ""
        } ${
          secretRule?.RuleArn ?? "rule does not exist"
        }, secret not found in rule conditions`,
      };
};

export const writeSecretToELB = async (
  priority: string,
  cellAccount: AmplifyAccount,
  secretValue: string
): Promise<void> => {
  const { region } = cellAccount;

  console.log(
    `Writing secret to ELB at ${cellAccount.region}:${cellAccount.accountId}`
  );

  const cellGatewayLoadBalancerArn = await findCellGatewayLoadBalancerArn(
    cellAccount
  );

  const elbClient = new ElasticLoadBalancingV2Client({
    region,
    credentials: getIsengardCredentialsProvider(
      cellAccount.accountId,
      "OncallOperator"
    ),
  });

  const listenerArn = await getListenerArn(
    elbClient,
    cellGatewayLoadBalancerArn
  );

  const describeRulesCommandOutput = await elbClient.send(
    new DescribeRulesCommand({ ListenerArn: listenerArn })
  );

  const forwardRules = describeRulesCommandOutput
    .Rules!.filter(isForwardToCellGatewayServiceRule)
    .filter((rule) => rule.Priority === priority);

  if (forwardRules.length !== 1) {
    throw new Error(
      `There should be exactly 1 forward rule for ${listenerArn} but ${forwardRules.length} were found. This is unexpected`
    );
  }

  const forwardRule = forwardRules[0];

  if (!forwardRule.Conditions || forwardRule.Conditions.length !== 1) {
    throw new Error(
      `There should be exactly 1 condition rule for ${
        forwardRule.RuleArn
      } but ${
        forwardRule?.Conditions?.length ?? 0
      } were found. This is unexpected`
    );
  }

  const condition = forwardRule.Conditions![0];

  condition.HttpHeaderConfig!.Values = [secretValue];

  await elbClient.send(
    new ModifyRuleCommand({
      RuleArn: forwardRule.RuleArn,
      Actions: forwardRule.Actions,
      Conditions: [condition],
    })
  );
};

export const elbSecretStoreWithPriority = (priority: string): SecretStore => ({
  readSecret: partial(readSecretsFromELB, [priority]),
  writeSecret: partial(writeSecretToELB, [priority]),
});
