import {
  AmplifyAccount,
  getIsengardCredentialsProvider,
} from "../../../../commons/Isengard";
import { getCloudFormationOutputs } from "../../../../commons/utils/cloudFormation";
import {
  DescribeListenersCommand,
  DescribeRulesCommand,
  ElasticLoadBalancingV2Client,
  ModifyRuleCommand,
  Rule,
} from "@aws-sdk/client-elastic-load-balancing-v2";
import { SecretStore } from "./types";
import { partial } from "ramda";

const isForwardToHostingGatewayServiceRule = (rule: Rule): boolean => {
  return (
    !!rule.Actions?.find((action) => action.Type === "forward") &&
    !!rule.Conditions?.find(
      (condition) =>
        condition.HttpHeaderConfig?.HttpHeaderName ===
        "x-amplify-origin-verify-header"
    )
  );
};

const findHostingGatewayLoadBalancerArn = async (
  dataplane: AmplifyAccount
): Promise<string> => {
  const { stage } = dataplane;
  const stackName = `HostingGateway-${stage}`;

  const outputs = await getCloudFormationOutputs({
    amplifyAccount: dataplane,
    outputKeys: ["HostingGatewayLoadBalancerArn"],
    stackName,
  });

  if (outputs.HostingGatewayLoadBalancerArn === undefined) {
    throw new Error(
      `The HostingGatewayLoadBalancerArn key is not found in the outputs of ${stackName}`
    );
  }

  return outputs.HostingGatewayLoadBalancerArn;
};

const getListenerArn = async (
  elbClient: ElasticLoadBalancingV2Client,
  hostingGatewayLoadBalancerArn: string
): Promise<string> => {
  const { Listeners } = await elbClient.send(
    new DescribeListenersCommand({
      LoadBalancerArn: hostingGatewayLoadBalancerArn,
    })
  );

  if (Listeners === undefined || Listeners.length === 0) {
    throw new Error(
      `There are no listeners for  ${hostingGatewayLoadBalancerArn}`
    );
  }

  if (Listeners.length > 1) {
    throw new Error(
      `There are multiple listeners for ${hostingGatewayLoadBalancerArn}. This is unexpected`
    );
  }

  return Listeners[0].ListenerArn!;
};

export const readSecretsFromELB = async (
  priority: string,
  dataPlaneAccount: AmplifyAccount
) => {
  const { region } = dataPlaneAccount;
  const hostingGatewayLoadBalancerArn = await findHostingGatewayLoadBalancerArn(
    dataPlaneAccount
  );

  const elbClient = new ElasticLoadBalancingV2Client({
    region,
    credentials: getIsengardCredentialsProvider(dataPlaneAccount.accountId),
  });

  const listenerArn = await getListenerArn(
    elbClient,
    hostingGatewayLoadBalancerArn
  );

  const describeRulesCommandOutput = await elbClient.send(
    new DescribeRulesCommand({ ListenerArn: listenerArn })
  );

  const secretRule = describeRulesCommandOutput
    .Rules!.filter(isForwardToHostingGatewayServiceRule)
    .find((rule) => rule.Priority === priority);

  const secretValue = secretRule?.Conditions?.[0].HttpHeaderConfig?.Values?.[0];

  return secretValue
    ? {
        value: secretValue,
        meta: `${dataPlaneAccount.email} - ELB priority:${secretRule!.Priority} ${
          secretRule!.RuleArn
        }`,
      }
    : {
        meta: `${dataPlaneAccount.email} - ELB priority:${
          secretRule?.Priority ?? ""
        } ${
          secretRule?.RuleArn ?? "rule does not exist"
        }, secret not found in rule conditions`,
      };
};

export const writeSecretToELB = async (
  priority: string,
  dataPlaneAccount: AmplifyAccount,
  secretValue: string
): Promise<void> => {
  const { region } = dataPlaneAccount;

  console.log(
    `Writing secret to ELB at ${dataPlaneAccount.region}:${dataPlaneAccount.accountId}`
  );

  const hostingGatewayLoadBalancerArn = await findHostingGatewayLoadBalancerArn(
    dataPlaneAccount
  );

  const elbClient = new ElasticLoadBalancingV2Client({
    region,
    credentials: getIsengardCredentialsProvider(
      dataPlaneAccount.accountId,
      "OncallOperator"
    ),
  });

  const listenerArn = await getListenerArn(
    elbClient,
    hostingGatewayLoadBalancerArn
  );

  const describeRulesCommandOutput = await elbClient.send(
    new DescribeRulesCommand({ ListenerArn: listenerArn })
  );

  const forwardRules = describeRulesCommandOutput
    .Rules!.filter(isForwardToHostingGatewayServiceRule)
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
