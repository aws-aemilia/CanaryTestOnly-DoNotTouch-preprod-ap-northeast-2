import { MinervaLimit } from "./MinervaLimit";

interface LimitUpdateRules {
  evaluate: (p: {
    minervaLimit: MinervaLimit;
    currentValue?: number;
    newValue: number;
  }) => void;

  ruleName: string;
  onBypassWarning: string;
}

const doNotDecreaseLimit: LimitUpdateRules = {
  evaluate: ({ minervaLimit, currentValue, newValue }) => {
    if (newValue < minervaLimit.defaultLimit) {
      throw new Error(
        `You cannot decrease limits. ${minervaLimit.name} has default limit of ${minervaLimit.defaultLimit} and cannot be decreased to ${newValue}.`
      );
    }
    if (currentValue !== undefined && newValue < currentValue) {
      throw new Error(
        `You cannot decrease limits. ${minervaLimit.name} cannot be decreased from ${currentValue} to ${newValue}.`
      );
    }
  },
  ruleName: "doNotDecreaseLimit",
  onBypassWarning: `Decreasing a limit can have a negative customer impact. We almost never want to do this. Known valid reasons to do this are:  
- Lowering limits for a malicious account
- Lowering limits that were set too high by mistake
`,
};

const doNotIncreaseLimitBeyondHardLimit: LimitUpdateRules = {
  evaluate: ({ minervaLimit, currentValue, newValue }) => {
    const { hardLimit } = minervaLimit;
    if (hardLimit !== undefined && newValue > hardLimit) {
      throw new Error(
        `You cannot increase limits beyond the hard limit. ${minervaLimit.name} has hard limit of ${minervaLimit.hardLimit} and cannot be changed from ${currentValue} to ${newValue}.`
      );
    }
  },
  ruleName: "doNotIncreaseLimitBeyondHardLimit",
  onBypassWarning: `Increasing a limit beyond the hard limit can cause availability or latency issues. The hard limits were chosen based on the constraints of Amplify architecture. 
We only grant this kind of limit increase in very rare cases and it requires L7 approval.
`,
};

const doNotIncreaseNonAdjustableLimit: LimitUpdateRules = {
  evaluate: ({ minervaLimit, currentValue, newValue }) => {
    if (!minervaLimit.isAdjustable) {
      throw new Error(
        `You cannot increase non-adjustable limits. ${minervaLimit.name} is flagged as non-adjustable in Minerva and has a default limit of ${minervaLimit.defaultLimit}.`
      );
    }
  },
  ruleName: "doNotIncreaseNonAdjustableLimit",
  onBypassWarning: `The limit you are attempting to update is not configured as adjustable in Minerva. This means that customers cannot request a limit increase for this limit.
It is still possible to change its value, but this can be very dangerous since we almost never change it and we have not defined a hard limit for it.
Make sure that you fully understand the implications of updating this limit and seek L7 approval before doing so.  
`,
};

export const allRules: LimitUpdateRules[] = [
  doNotDecreaseLimit,
  doNotIncreaseLimitBeyondHardLimit,
  doNotIncreaseNonAdjustableLimit,
];

export const allRuleNames = allRules.map((r) => r.ruleName);
