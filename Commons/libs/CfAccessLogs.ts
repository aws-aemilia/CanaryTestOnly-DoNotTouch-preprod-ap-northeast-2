import { AthenaClient } from "@aws-sdk/client-athena";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import {
  getAthenaQueryResults,
  startAthenaQuery,
  waitForAthenaQuery,
} from "../utils/athena";

export class CfAccessLogs {
  private athenaClient: AthenaClient;
  private outputBucket: string;

  constructor(
    accountId: string,
    region: string,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    this.athenaClient = new AthenaClient({
      region,
      credentials,
    });
    this.outputBucket = `aws-athena-query-results-${accountId}-${region}`;
  }

  public async query(query: string) {
    console.log(query, this.outputBucket);
    const reqId = await startAthenaQuery(
      this.athenaClient,
      query,
      this.outputBucket
    );
    await waitForAthenaQuery(this.athenaClient, reqId);
    return getAthenaQueryResults(this.athenaClient, reqId);
  }
}
