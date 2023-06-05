import { Rule } from "@aws-sdk/client-wafv2";

export const defaultWafRules: Rule[] = [
  {
    Name: "AWS-AWSManagedRulesAmazonIpReputationList",
    Priority: 0,
    Statement: {
      ManagedRuleGroupStatement: {
        VendorName: "AWS",
        Name: "AWSManagedRulesAmazonIpReputationList",
        RuleActionOverrides: [
          {
            Name: "AWSManagedIPReputationList",
            ActionToUse: {
              Count: {},
            },
          },
          {
            Name: "AWSManagedReconnaissanceList",
            ActionToUse: {
              Count: {},
            },
          },
          {
            Name: "AWSManagedIPDDoSList",
            ActionToUse: {
              Count: {},
            },
          },
        ],
      },
    },
    OverrideAction: {
      None: {},
    },
    VisibilityConfig: {
      SampledRequestsEnabled: true,
      CloudWatchMetricsEnabled: true,
      MetricName: "AWS-AWSManagedRulesAmazonIpReputationList",
    },
  },
  {
    Name: "CatchAmazonIpReputationListAndBlock429",
    Priority: 1,
    Statement: {
      OrStatement: {
        Statements: [
          {
            LabelMatchStatement: {
              Scope: "LABEL",
              Key: "awswaf:managed:aws:amazon-ip-list:AWSManagedReconnaissanceList",
            },
          },
          {
            LabelMatchStatement: {
              Scope: "LABEL",
              Key: "awswaf:managed:aws:amazon-ip-list:AWSManagedIPReputationList",
            },
          },
          {
            LabelMatchStatement: {
              Scope: "LABEL",
              Key: "awswaf:managed:aws:amazon-ip-list:AWSManagedIPDDoSList",
            },
          },
        ],
      },
    },
    Action: {
      Block: {
        CustomResponse: {
          ResponseCode: 429,
        },
      },
    },
    VisibilityConfig: {
      SampledRequestsEnabled: true,
      CloudWatchMetricsEnabled: true,
      MetricName: "CatchAmazonIpReputationListAndBlock429",
    },
  },
  {
    Name: "RateBasedRule",
    Priority: 2,
    Statement: {
      RateBasedStatement: {
        Limit: 2000,
        AggregateKeyType: "IP",
      },
    },
    Action: { Block: { CustomResponse: { ResponseCode: 429 } } },
    VisibilityConfig: {
      SampledRequestsEnabled: true,
      CloudWatchMetricsEnabled: true,
      MetricName: "RateBasedRule",
    },
  },
];
