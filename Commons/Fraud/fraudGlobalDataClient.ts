import { FgdPublishedProxy } from "@amzn/aws-fraud-global-data-node-sdk";
import * as f from "@amzn/aws-fraud-types";
import * as fgd from "@amzn/aws-fraud-global-data-node-sdk";
import * as fapi from "@amzn/aws-fraud-api-client";

import pino from "pino";
import pinoPretty from "pino-pretty";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Isengard";

const logger = pino(pinoPretty());

/**
 * Example Usage: 
 * 
 * 
 * import { FraudGlobalDataClient } from "./Fraud/fraudGlobalDataClient";
    const main = async () => {
        console.log('Test Get Containment Score')
        const stage = 'prod'
        const region = 'us-west-2'
        const fraudClient = new FraudGlobalDataClient(stage, region)
        const data = await fraudClient.getContainmentScoreForAccount('123456789')
        console.log(`c-score: ${data.defaultScore}`);
    };

    main()
        .then()
        .catch((e) => console.error(e));
 */
export class FraudGlobalDataClient {
  private apiKey = "bf0e0563-ed53-4e12-b9a8-7d98b720cca1";
  private clientApp = "Amplify Hosting";
  private clientUser = "amplify";

  private client: FgdPublishedProxy | null = null;
  private stage: Stage;
  private region: Region;

  constructor(stage: Stage, region: Region) {
    this.client = null;
    this.stage = stage;
    this.region = region;
  }

  private build = async () => {
    if (this.client) {
      logger.info(
        `client already built for Stage: ${this.stage}, Region: ${this.region}, re-using it`
      );
      return this.client;
    }
    logger.info(
      `creating new client for Stage: ${this.stage}, Region: ${this.region}`
    );

    // get service account for stage/region
    const serviceAccount = await controlPlaneAccount(this.stage, this.region);

    // Create the Fraud tools client url
    // https://code.amazon.com/packages/AWSFraudGlobalDataClientConfig/blobs/2.0/--/configuration/brazil-config/global/AWSFraudGlobalDataClientConfigProd.cfg
    const typeOfHost = "repl";
    const deploymentGroupCode = "cl";
    const apiStage = "api";
    const apiUrl = `https://gw.${this.stage.toLowerCase()}.${serviceAccount.airportCode.toLowerCase()}.${typeOfHost}.api2.data.${deploymentGroupCode}.fraud.platform.aws.dev/${apiStage}`;

    // The FGD client is flawed and calls the credentials provider for ALL requests, even if the credentials are not expired,
    // which causes Isengard throttles. To work around this we store credentials in a variable.
    const staticCredentials = await getIsengardCredentialsProvider(
      serviceAccount.accountId,
      "OncallOperator"
    )();

    // init the Fraud Tools Client
    const client = new FgdPublishedProxy(
      new fapi.Client(
        fapi.Client.createAxiosInstance(),
        async () => staticCredentials
      ),
      this.region as f.AwsRegionCode,
      apiUrl
    );
    this.client = client;
    return client;
  };

  /**
   * Returns Fraud Data (including Containment Score) for a given AWS Account ID.
   *
   * @param accountId The accountId to fetch the fraud data for.
   * @param stage The Stage to query
   * @param region The Region to query
   * @returns Fraud data of type PublishedContainmentScore
   */
  public getContainmentScoreForAccount = async (
    accountId: string
  ): Promise<f.Fgd.PublishedContainmentScore> => {
    try {
      logger.info(
        `Fetching Fraud data for ${accountId} in stage: ${this.stage}, region: ${this.region}...`
      );
      const client = await this.build();
      const uuid = fgd.guid;
      const cscoreResult = await client.getAccountContainmentScore(accountId, {
        clientApp: this.clientApp,
        clientUser: this.clientUser,
        clientRequestId: uuid(),
        clientApiKey: this.apiKey,
      });
      if (cscoreResult.status !== 200) {
        throw new Error(
          `Resonse Status [${cscoreResult.status}] was not successfull.`
        );
      }

      logger.info(`Successfully fetched Fraud data`);
      return cscoreResult.data;
    } catch (e) {
      logger.error("Failed to fetch Fraud Data", e);
      throw e;
    }
  };
}
