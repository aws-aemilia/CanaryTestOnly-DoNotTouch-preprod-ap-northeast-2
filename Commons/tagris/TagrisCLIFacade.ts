import { exec } from "Commons/utils/exec";
import { AwsCredentialIdentity } from "@aws-sdk/types";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "Commons/Isengard";
import { AirportCode } from "Commons/Isengard/types";
import { toAirportCode } from "Commons/utils/regions";

/**
 * This class encapsulates the chore of building/parsing Tagris CLI inputs/outputs
 *
 * The Tagris CLI must be following https://w.amazon.com/bin/view/AWSTagris/Tagris/TagrisDIYTools/ServiceTeams
 */
export class TagrisCLIFacade {
  private readonly creds: AwsCredentialIdentity;
  private readonly airportCode: AirportCode;
  constructor(creds: AwsCredentialIdentity, airportCode: AirportCode) {
    this.creds = creds;
    this.airportCode = airportCode;
  }

  static async create(stage: Stage, region: Region) {
    const acc = await controlPlaneAccount(stage, region);
    const creds = await getIsengardCredentialsProvider(acc.accountId)();
    return new TagrisCLIFacade(creds, toAirportCode(acc.airportCode));
  }

  /**
   * Invoke the Tagris CLI GetTagsForResourceList API
   *
   * The Tagris CLI calls are VERY SLOW, they can take up to 15 seconds to complete (I believe this is due to expensive initialization of the CLI)
   *
   * It is recommended to use the `resourceList` parameter to pass in a large list of resources, instead of calling this method for a single resource.
   */
  public async getTagsForResourceList(
    input: GetTagsForResourceListInput
  ): Promise<GetTagsForResourceListOutput> {
    const { stdout, stderr } = await exec(
      this.getCLICommand(input),
      this.creds
    );

    const output = this.filterOutTagrisCLILogs(stdout);
    return JSON.parse(output) as GetTagsForResourceListOutput;
  }

  private filterOutTagrisCLILogs(stdout: string) {
    // The Tagris CLI outputs some extra logs before the JSON response. We need to filter that out
    const lines = stdout.split("\n");
    return lines.filter((line) => !line.includes("TagrisCLI:")).join("");
  }

  private getCLICommand(input: GetTagsForResourceListInput) {
    return `
/apollo/env/AWSTagrisTools/bin/tagris-cli -s tsm-svc \\
  -c GetTagsForResourceList \\
  -e frontend.prod.${this.airportCode.toLowerCase()} \\
  -j '${JSON.stringify(input)}'
  `;
  }
}

export type GetTagsForResourceListInput = {
  accountId: string;
  resourceList: string[];
  includeTerminated: boolean;
};

export type GetTagsForResourceListOutput = {
  resourceTagMappingList: {
    internalId: string;
    tagSet: Record<string, string>;
    amazonResouceName: string; // not a typo in "Resouce". This is how it's spelled in the output
    beginHour: number;
    sweepList: boolean;
    version: number;
    status: string;
  }[];
};
