import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  preflightCAZ,
  Region,
  Stage,
} from "Commons/Isengard";

import logger from "Commons/utils/logger";
import { toRegionName } from "Commons/utils/regions";
import {
  getCommand,
  getRipServiceName,
  updateCommand,
} from "./build-minerva-commands";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { RegionName } from "Commons/Isengard/types";
import { exec, ExecError } from "Commons/utils/exec";
import { arroyoBasedLimits } from "./MinervaLimit";

type MinervaCLIGetLimitOutput = {
  SubjectLimit: {
    RipServiceName: string;
    InternalLimitName: string;
    Value: {
      LimitType: string;
      SingleValue: number;
    };
  };
  SubjectType: string;
  SubjectId: string;
};

/**
 * We just assume that the output is JSON with a known shape
 */
const parseMinervaCLIGetLimitOutput = (
  output: string
): MinervaCLIGetLimitOutput => JSON.parse(output) as MinervaCLIGetLimitOutput;

/**
 * This class encapsulates the chore of building/parsing Minerva CLI inputs/outputs
 */
export class MinervaFacade {
  private readonly stage: Stage;
  private readonly region: RegionName;
  private lazyCredentialsProvider?: Provider<AwsCredentialIdentity>;
  constructor(stage: Stage, region: Region) {
    this.stage = stage;
    this.region = toRegionName(region);
  }

  public async getLimit(
    limitName: string,
    accountId: string,
    appId?: string | undefined
  ): Promise<MinervaCLIGetLimitOutput | undefined> {
    let command: string;
    if (arroyoBasedLimits.includes(limitName) && !appId) {
      throw new Error("App ID must be defined when getting RPS Limits");
    }
    command = getCommand({
      subjectId: appId
        ? `arn:aws:amplify:${this.region}:${accountId}:apps/${appId}`
        : accountId,
      subjectType: appId ? "RESOURCE" : "ACCOUNT",
      limitName,
      ripServiceName: getRipServiceName(this.stage),
      regionName: this.region,
    });

    const creds: AwsCredentialIdentity = await (
      await this.getCredentialsProvider()
    )();

    try {
      const { stdout, stderr } = await exec(command, creds);
      return parseMinervaCLIGetLimitOutput(stdout);
    } catch (e) {
      if ((e as ExecError).stderr?.includes("NoSuchResourceException")) {
        // This means that there are no overrides for this limit. The default limit value will be used.
        return undefined;
      }
      throw e;
    }
  }

  public async updateLimit(
    limitName: string,
    accountId: string,
    value: number
  ): Promise<void> {
    const minervaCommand = updateCommand({
      subjectId: accountId,
      subjectType: "ACCOUNT",
      ripServiceName: getRipServiceName(this.stage),
      regionName: this.region,
      limitName,
      value: value.toString(),
    });

    const creds: AwsCredentialIdentity = await (
      await this.getCredentialsProvider()
    )();

    const { stdout, stderr } = await exec(minervaCommand, creds);
    if (stderr) {
      logger.error("An error occurred", stderr);
      throw new Error(stderr);
    }
  }

  private async getCredentialsProvider(): Promise<
    Provider<AwsCredentialIdentity>
  > {
    if (!this.lazyCredentialsProvider) {
      this.lazyCredentialsProvider = await this.init();
    }
    return this.lazyCredentialsProvider;
  }

  private async init(): Promise<Provider<AwsCredentialIdentity>> {
    logger.info(`
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ THIS MUST BE RUN FROM A DEV DESKTOP WITH  ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️ aws-minerva (MAWS) INSTALLED              ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️
    ⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️

    Docs link:
    https://w.amazon.com/bin/view/AWS/Mobile/AppHub/Internal/Operations/Runbook/SDC#HGettingstarted:SetupyourCloudDesktoptousetheMinervaCLI
    `);

    const controlPlaneAccountResponse = await controlPlaneAccount(
      this.stage,
      this.region
    );

    const sdcManagementRole = "SDCLimitManagement";

    await preflightCAZ({
      accounts: controlPlaneAccountResponse,
      role: sdcManagementRole,
    });

    return getIsengardCredentialsProvider(
      controlPlaneAccountResponse.accountId,
      sdcManagementRole
    );
  }
}
