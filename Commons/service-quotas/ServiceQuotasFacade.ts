import { NoSuchApplicationException } from "@amzn/aws-amplify-cloudfrontbroker-typescript-client";
import {
  GetServiceQuotaCommand,
  ListServiceQuotasCommand,
  NoSuchResourceException,
  ServiceQuotasClient,
  ServiceQuotasServiceException,
} from "@aws-sdk/client-service-quotas";
import { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { Region, Stage } from "Commons/Isengard";

export class ServiceQuotasFacade {
  private readonly serviceQuotasClient: ServiceQuotasClient;

  constructor(
    stage: Stage,
    region: Region,
    credentials?: Provider<AwsCredentialIdentity>
  ) {
    if (stage !== "test" && !credentials) {
      throw new Error("Credentials must be provided for non test stage");
    }

    this.serviceQuotasClient = new ServiceQuotasClient({
      region,
      credentials,
    });
  }

  async getQuota(service: string, quotaCode: string) {
    console.log("Getting quota for ", service, quotaCode);
    try {
      const res = await this.serviceQuotasClient.send(
        new GetServiceQuotaCommand({
          ServiceCode: service,
          QuotaCode: quotaCode,
        })
      );
      return res;
    } catch (e) {
      if (
        e instanceof ServiceQuotasServiceException &&
        e.name === NoSuchResourceException.name
      ) {
        return null;
      }
      throw e;
    }
  }

  async listQuotas(service: string) {
    const req = new ListServiceQuotasCommand({
      ServiceCode: service,
    });
    return this.serviceQuotasClient.send(req);
  }
}
