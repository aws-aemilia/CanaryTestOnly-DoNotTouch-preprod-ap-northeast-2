import { QueryConfig } from "../batchQuery";
import { CostBasedThrottlesQuery } from "./CostBasedThrottlesQuery";

export function getQueryConfig(queryId: string): QueryConfig {
  switch (queryId) {
    case "CostBasedThrottlesQuery":
      return new CostBasedThrottlesQuery();
    default:
      throw new Error("Query ID not registered");
  }
}
