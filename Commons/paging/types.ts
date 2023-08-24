// Represents a page object as it comes from the paging.corp.a2z.com API
export interface RawPage {
  acceptCode: string;
  arn: string;
  content: string;
  deliveryTime: number;
  engagementArn: string;
  incidentId: string;
  originalRegion: string;
  publicContent: string;
  publicSubject: string;
  readTime: number;
  sender: string;
  sentTime: number;
  subject: string;
}

// Represents our own simplified version of a Page with attributes parsed for convenience
export interface Page {
  subject: string;
  ticketId: string | null;
  sender: string;
  sentTime: Date;
}

// Response from the paging.corp.a2z.com ListPages API.
export interface ListPagesResponse {
  nextToken: string | null;
  pages: RawPage[];
}
