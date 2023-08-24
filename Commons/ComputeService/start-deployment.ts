import {
  AmplifyHostingComputeClient,
  StartDeploymentCommand,
  StartDeploymentCommandInput,
  StartDeploymentCommandOutput,
} from "@amzn/awsamplifycomputeservice-client";

export const startDeployment = async (
  client: AmplifyHostingComputeClient,
  startDeploymentInput: StartDeploymentCommandInput
): Promise<StartDeploymentCommandOutput> => {
  try {
    const deploymentResponse = await client.send(
      new StartDeploymentCommand(startDeploymentInput)
    );
    return deploymentResponse;
  } catch (e) {
    throw e;
  }
};
