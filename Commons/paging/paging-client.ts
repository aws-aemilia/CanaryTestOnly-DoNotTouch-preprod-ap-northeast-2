import logger from "../../Commons/utils/logger";
import { getSsoCookie } from "./midway";
import aws4 from "aws4";
import axios, { AxiosResponse, AxiosInstance } from "axios";
import { Page, RawPage, ListPagesResponse } from "./types";
import {
  STSClient,
  AssumeRoleWithWebIdentityCommand,
  Credentials,
} from "@aws-sdk/client-sts";

/**
 * The paging service doesn't have a client to consume their API. So this class is a reverse engineering attempt
 * at calling their API based on how the website paging.corp.a2z.com does it. It uses midway cookies to get an
 * SSO token which then uses it to assume a role in the sos-user_portal-prod@amazon.com account: 991761955833,
 * and sign the requests with those credentials. I wouldn't be surprised if this breaks in the future :/ given
 * that is not an official client for the paging service.
 */
export class PagingClient {
  private readonly hostName: string = "us-west-2.paging.corp.a2z.com";
  private readonly pagingIamRole: string =
    "arn:aws:iam::991761955833:role/FederatedAccessRole-prod";
  private readonly serviceName: string = "sos";
  private readonly pagerApi: AxiosInstance;
  private readonly amazonAlias: string;

  constructor(amazonAlias: string) {
    this.amazonAlias = amazonAlias;
    this.pagerApi = axios.create({
      baseURL: `https://${this.hostName}`,
    });
  }

  /**
   * Uses midway cookie to fetch all pages for the current user.
   *
   * @param from Timestamp to start fetching pages from
   * @param to Timestamp to stop fetching pages from
   */
  async listPages(from: Date, to: Date): Promise<Page[]> {
    const ssoCookie = await getSsoCookie();
    const credentials = await this.getWebIdentityCredentials(ssoCookie.value);
    const rawPages: RawPage[] = [];

    let nextToken: string | null = null;

    do {
      const body: any = {
        contactArn: `arn:aws:sos:us-west-2:991761955833:contact/amazon:${this.amazonAlias}`,
        incidentId: "",
        sender: "",
        maxResults: 250,
        timeRange: {
          fromTime: from.getTime(),
          toTime: to.getTime(),
        },
      };

      if (nextToken) {
        body.nextToken = nextToken;
      }

      const signedRequest = aws4.sign(
        {
          path: "/",
          service: this.serviceName,
          region: "us-west-2",
          host: this.hostName,
          body: JSON.stringify(body),
          method: "POST",
          headers: {
            "X-Amz-Target": "AwsSOSInterfaceService.ListPages",
            "Content-Type": "application/x-amz-json-1.1",
          },
        },
        {
          accessKeyId: credentials.AccessKeyId!,
          secretAccessKey: credentials.SecretAccessKey!,
          sessionToken: credentials.SessionToken!,
        }
      );

      if (!signedRequest.headers) {
        throw new Error("Failed to sign request for paging.corp.a2z.com");
      }

      const response: AxiosResponse<ListPagesResponse> =
        await this.pagerApi.post("/", JSON.stringify(body), {
          headers: signedRequest.headers,
        });

      nextToken = response.data.nextToken;
      rawPages.push(...response.data.pages);

      logger.info(
        `Response from ${this.hostName} = %s %s`,
        response.status,
        response.statusText
      );
    } while (nextToken);

    // Map raw pages to our Page interface
    return rawPages.map((r: RawPage) => this.mapRawPage(r));
  }

  /**
     Example of a raw page:
     {
        "acceptCode": "997001",
        "arn": "arn:aws:sos:us-west-2:991761955833:page/amazon:fdingler/df8be20a-fb37-47b8-9558-0b0d9f891439",
        "contactArn": "arn:aws:sos:us-west-2:991761955833:contact/amazon:fdingler",
        "content": "\nView in SIM Ticketing: https://t.corp.amazon.com/issues/V984500087\n\n\n\n.",
        "deliveryTime": 1691420577.496,
        "engagementArn": "arn:aws:sos:us-west-2:991761955833:engagement/amazon:f3f92076-078e-4287-a501-be6ab73df73b",
        "incidentId": "a385f7af-1c01-4a06-a5b9-c62364b511a8",
        "originalRegion": "us-east-1",
        "publicContent": "\nView in SIM Ticketing: https://t.corp.amazon.com/issues/V984500087\n\n\n\n.",
        "publicSubject": "To:page-aws-mobile-amplify-primary@amazon.com SIM V984500087 New Sev2 - AmplifyHostingKinesisConsumer.FRA.prod.high_sev_alarm - Aggregate",
        "readTime": 1691420588.021,
        "sender": "issues@amazon.com",
        "sentTime": 1691420575.554,
        "subject": "To:page-aws-mobile-amplify-primary@amazon.com SIM V984500087 New Sev2 - AmplifyHostingKinesisConsumer.FRA.prod.high_sev_alarm - Aggregate"
     }
     */
  private mapRawPage(rawPage: RawPage): Page {
    return {
      subject: this.extractSubject(rawPage.subject),
      ticketId: this.extractTicketId(rawPage.subject) || null,
      sender: rawPage.sender,
      sentTime: new Date(rawPage.sentTime * 1000),
    };
  }

  private extractTicketId(rawSubject: string): string | null {
    const match = rawSubject.match(/(?:SIM|Ticket \#|TT) (\w+)/);
    if (match && match.length > 1) {
      return match[1];
    }

    return null;
  }

  private extractSubject(rawSubject: string): string {
    return rawSubject.replace(/^.*Sev\d(.\d)? - /, "");
  }

  async getWebIdentityCredentials(webToken: string): Promise<Credentials> {
    try {
      const stsClient = new STSClient({
        region: "us-west-2",
      });

      const stsResponse = await stsClient.send(
        new AssumeRoleWithWebIdentityCommand({
          RoleArn: this.pagingIamRole,
          RoleSessionName: "web-user",
          WebIdentityToken: webToken,
        })
      );

      return stsResponse.Credentials!;
    } catch (err) {
      throw new Error("Failed to assume role, have you run mwinit?");
    }
  }
}
