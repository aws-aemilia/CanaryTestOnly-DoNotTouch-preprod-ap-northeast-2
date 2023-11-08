import { EdgeConfigDAO } from "Commons/dynamodb/tables/EdgeConfigDAO";
import { BranchDAO } from "Commons/dynamodb/tables/BranchDAO";
import { createLogger } from "Commons/utils/logger";

const logger = createLogger();

export const representsActiveJob = async (
  {
    edgeConfigDAO,
    branchDAO,
  }: { edgeConfigDAO: EdgeConfigDAO; branchDAO: BranchDAO },
  hostingConfigRow: {
    appId: string;
    branchName: string;
    activeJobId: string;
  }
): Promise<boolean> => {
  const edgeConfig = await edgeConfigDAO.getLambdaEdgeConfigForAppOrDomain(
    hostingConfigRow.appId
  );

  if (!edgeConfig) {
    logger.info(
      `No EdgeConfig found for app ${hostingConfigRow.appId}. Most likely it was deleted. Skipping...`
    );
    return false;
  }

  const branch = await branchDAO.getBranch({
    appId: hostingConfigRow.appId,
    branchName: hostingConfigRow.branchName,
  });

  if (!branch) {
    logger.info(
      `No Branch found for app ${hostingConfigRow.appId} and branch ${hostingConfigRow.branchName}. Most likely it was deleted. Skipping...`
    );
    return false;
  }

  if (
    edgeConfig.branchConfig?.[branch.displayName]?.activeJobId !==
    hostingConfigRow.activeJobId
  ) {
    logger.info(
      `HostingConfig ${hostingConfigRow.appId}/${hostingConfigRow.branchName} ${
        hostingConfigRow.activeJobId
      } does not match the active Job. activeJob in EdgeConfig is ${
        edgeConfig.branchConfig?.[hostingConfigRow.branchName]?.activeJobId
      }. Skipping...`
    );
    return false;
  } else {
    return true;
  }
};
