import { MinervaLimit } from "./MinervaLimit";
import { allRules } from "./LimitUpdateRules";
import logger from "Commons/utils/logger";
import confirm from "Commons/utils/confirm";

export const validateLimitUpdateRules = async ({
  currentValue,
  minervaLimit,
  newValue,
  rulesToBypass = [],
}: {
  minervaLimit: MinervaLimit;
  currentValue?: number;
  newValue: number;
  rulesToBypass?: string[];
}) => {
  for (const rule of allRules) {
    if (rulesToBypass.includes(rule.ruleName)) {
      logger.warn(
        `Bypassing rule: ${rule.ruleName} when updating limit ${minervaLimit.name} from ${currentValue} to ${newValue}`
      );
      logger.warn(rule.onBypassWarning);
      const confirmed: boolean = await confirm(
        "⚠️⚠️ Are you sure that you want to bypass this rule and apply the limit update? ⚠️⚠️"
      );
      if (!confirmed) {
        throw new Error("Limit update aborted.");
      }
      continue;
    }

    try {
      rule.evaluate({ minervaLimit, currentValue, newValue });
    } catch (e) {
      logger.error(
        `Validation failed for rule: ${rule.ruleName}. You can bypass this rule by running this tool with "--rulesToBypass ${rule.ruleName}" but be aware of the risks: 
${rule.onBypassWarning}
`
      );
      throw e;
    }
  }
};
