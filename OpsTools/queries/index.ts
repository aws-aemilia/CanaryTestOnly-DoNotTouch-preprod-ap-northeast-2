import { QueryConfig } from "../batchQuery";
import { CostBasedThrottlesQuery } from "./CostBasedThrottlesQuery";
import { WeeklyBuildExecutionQuery } from "./WeeklyBuildExecutionQuery";
import { WeeklyBuildTriggersQuery } from "./WeeklyBuildTriggersQuery";
import { WeeklyControlPlaneQuery } from "./WeeklyControlPlaneQuery";

export function getQueryConfig(queryId: string): QueryConfig {
  switch (queryId) {
    case "CostBasedThrottlesQuery":
      return new CostBasedThrottlesQuery();
    case "WeeklyControlPlaneQuery":
      return new WeeklyControlPlaneQuery();
    case "WeeklyBuildTriggersQuery":
      return new WeeklyBuildTriggersQuery();
    case "WeeklyBuildExecutionQuery":
      return new WeeklyBuildExecutionQuery();
    default:
      throw new Error("Query ID not registered");
  }
}
