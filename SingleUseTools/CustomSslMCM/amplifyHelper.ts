import {
  AmplifyClient,
  CreateAppCommand,
  CreateAppResult,
  CreateBranchCommand,
  CreateBranchResult,
  CreateDomainAssociationCommand,
  CreateDomainAssociationResult,
  DeleteAppCommand,
  DeleteDomainAssociationCommand,
  DeleteDomainAssociationCommandOutput,
  GetDomainAssociationCommand,
  GetDomainAssociationResult,
  SubDomain,
  SubDomainSetting,
  UpdateDomainAssociationCommand,
  UpdateDomainAssociationResult,
} from "@aws-sdk/client-amplify";
import { AdaptiveRetryStrategy } from "@aws-sdk/middleware-retry";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { RegionName } from "Commons/Isengard/types";
import logger from "Commons/utils/logger";
import sleep from "Commons/utils/sleep";
import { POLL_INTERVAL_IN_MILLIS } from "./constants";

export const getAmplifyClient = ({
  credentials,
  endpoint,
  region,
}: {
  credentials: Provider<AwsCredentialIdentity>;
  endpoint: string;
  region: RegionName;
}): AmplifyClient => {
  const retryStrategy = new AdaptiveRetryStrategy(() => Promise.resolve(100), {
    retryDecider: (error) => {
      // Check if the error is a 5xx or a ThrottlingException
      return !!(
        error.name.includes("Throttling") ||
        (error.$metadata?.httpStatusCode &&
          error.$metadata.httpStatusCode >= 500)
      );
    },
  });

  return new AmplifyClient({
    credentials,
    endpoint,
    region,
    retryStrategy,
  });
};

export const createApp = async (
  amplifyClient: AmplifyClient
): Promise<CreateAppResult> => {
  const createAppCommand = new CreateAppCommand({
    name: "custom-ssl-mcm-verify-app",
  });

  logger.info(
    `Calling CreateApp with command ${JSON.stringify(createAppCommand)}`
  );
  const createAppResult = await amplifyClient.send(createAppCommand);
  logger.info(`CreateApp result: ${JSON.stringify(createAppResult)}`);

  return createAppResult;
};

export const deleteApp = async ({
  amplifyClient,
  appId,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
}): Promise<CreateAppResult> => {
  const deleteAppCommand = new DeleteAppCommand({ appId });

  logger.info(
    `Calling DeleteApp with command ${JSON.stringify(deleteAppCommand)}`
  );
  const deleteAppResult = await amplifyClient.send(deleteAppCommand);
  logger.info(`DeleteApp result: ${JSON.stringify(deleteAppResult)}`);

  return deleteAppResult;
};

export const createBranch = async ({
  amplifyClient,
  appId,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
}): Promise<CreateBranchResult> => {
  const branchName = "main";
  const createBranchCommand = new CreateBranchCommand({
    appId,
    branchName,
  });

  logger.info(`Calling CreateBranch with command ${createBranchCommand}`);
  const createBranchResult = await amplifyClient.send(createBranchCommand);
  logger.info(`CreateBranch result: ${JSON.stringify(createBranchResult)}`);

  return createBranchResult;
};

export const createDomainAssociation = async ({
  amplifyClient,
  appId,
  branchName,
  domainName,
  subDomainSettings,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  branchName: string;
  domainName: string;
  subDomainSettings: SubDomainSetting[];
}): Promise<CreateDomainAssociationResult> => {
  const createDomainAssociationCommand = new CreateDomainAssociationCommand({
    appId,
    domainName,
    subDomainSettings,
  });

  logger.info(
    `Calling CreateDomainAssociation with command ${JSON.stringify(
      createDomainAssociationCommand
    )}`
  );
  const createDomainResult = await amplifyClient.send(
    createDomainAssociationCommand
  );
  logger.info(
    `CreateDomainAssociation result: ${JSON.stringify(createDomainResult)}`
  );

  return createDomainResult;
};

export const isDomainStatusTerminal = (domainStatus: string) =>
  domainStatus === "AVAILABLE" || domainStatus === "FAILED";

export const isUpdateStatusTerminal = (updateStatus: string) =>
  updateStatus === "UPDATE_COMPLETE" || updateStatus === "UPDATE_FAILED";

export const getDomainAssociation = async ({
  amplifyClient,
  appId,
  domainName,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  domainName: string;
}): Promise<GetDomainAssociationResult> => {
  const getDomainAssociationCommand = new GetDomainAssociationCommand({
    appId,
    domainName,
  });

  return await amplifyClient.send(getDomainAssociationCommand);
};

export const getDomainStatus = async ({
  amplifyClient,
  appId,
  domainName,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  domainName: string;
}): Promise<string> => {
  const { domainAssociation } = await getDomainAssociation({
    amplifyClient,
    appId,
    domainName,
  });
  if (!domainAssociation?.domainStatus) {
    throw new Error("GetDomainAssociation did not return domainStatus.");
  }

  return domainAssociation.domainStatus;
};

export const waitUntilDomainIsAvailable = async ({
  amplifyClient,
  appId,
  domainName,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  domainName: string;
}) => {
  let domainStatus: string = await getDomainStatus({
    amplifyClient,
    appId,
    domainName,
  });

  while (!isDomainStatusTerminal(domainStatus)) {
    logger.info(
      `Current domainStatus is: ${domainStatus}. ` +
        `Calling GetDomainAssociation until domainStatus is terminal.`
    );
    await sleep(POLL_INTERVAL_IN_MILLIS);
    domainStatus = await getDomainStatus({ amplifyClient, appId, domainName });
  }

  if (domainStatus === "FAILED") {
    const domainAssociation = await getDomainAssociation({
      amplifyClient,
      appId,
      domainName,
    });
    logger.error(
      "Domain Association failed. DomainAssociation is: " +
        JSON.stringify(domainAssociation)
    );
    throw new Error(
      "Creating domain association failed because domainStatus is FAILED."
    );
  }

  if (domainStatus !== "AVAILABLE") {
    throw new Error(`Unknown domainStatus: ${domainStatus}`);
  }

  logger.info("domainStatus is now AVAILABLE.");
};

export const updateDomainAssociation = async ({
  amplifyClient,
  appId,
  branchName,
  domainName,
  subDomainSettings,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  branchName: string;
  domainName: string;
  subDomainSettings: SubDomainSetting[];
}): Promise<UpdateDomainAssociationResult> => {
  const updateDomainAssociationCommand = new UpdateDomainAssociationCommand({
    appId,
    domainName,
    subDomainSettings,
  });

  logger.info(
    `Calling UpdateDomainAssociation with command ${JSON.stringify(
      updateDomainAssociationCommand
    )}`
  );
  const updateDomainResult = await amplifyClient.send(
    updateDomainAssociationCommand
  );
  logger.info(
    `UpdateDomainAssociation result: ${JSON.stringify(updateDomainResult)}`
  );

  return updateDomainResult;
};

export const deleteDomainAssociation = async ({
  amplifyClient,
  appId,
  domainName,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  domainName: string;
}): Promise<DeleteDomainAssociationCommandOutput> => {
  const deleteDomainAssociationCommand = new DeleteDomainAssociationCommand({
    appId,
    domainName,
  });

  logger.info(
    `Calling DeleteDomainAssociation with command ${JSON.stringify(
      deleteDomainAssociationCommand
    )}`
  );
  const deleteDomainResult = await amplifyClient.send(
    deleteDomainAssociationCommand
  );
  logger.info(
    `DeleteDomainAssociation result: ${JSON.stringify(deleteDomainResult)}`
  );

  return deleteDomainResult;
};

export const createAppAndGetAppId = async (
  amplifyClient: AmplifyClient
): Promise<string> => {
  const { app } = await createApp(amplifyClient);
  if (!app?.appId) {
    throw new Error("CreateAppResult is missing appId");
  }
  return app.appId;
};

export const createBranchAndGetBranchName = async ({
  amplifyClient,
  appId,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
}): Promise<string> => {
  const { branch } = await createBranch({ amplifyClient, appId });
  if (!branch?.branchName) {
    throw new Error("CreateBranchResult is missing branchName.");
  }
  return branch.branchName;
};

export const getDomainAssociationSubDomains = async ({
  amplifyClient,
  appId,
  domainName,
}: {
  amplifyClient: AmplifyClient;
  appId: string;
  domainName: string;
}): Promise<SubDomain[]> => {
  const { domainAssociation } = await getDomainAssociation({
    amplifyClient,
    appId,
    domainName,
  });

  if (!domainAssociation?.subDomains) {
    throw new Error("domainAssociation is missing subDomains");
  }

  return domainAssociation.subDomains;
};
