export interface ReportEntry {
  pageTimestamp: Date;
  pageSubject: string;
  ticketId?: string;
  ticketStatus?: string;
  rootCause?: string;
  timeSpentMinutes: number;
  category: Category;
  pain: Pain;
}

export interface OncallReport {
  workingHourPages: number;
  afterHourPages: number;
  sleepingHourPages: number;
  totalPages: number;
  entriesByCategory: EntriesByCategory;
}

export enum Category {
  ControlPlane = "Control Plane",
  ComputeService = "Compute Service",
  WarmingPool = "Warming Pool",
  Canaries = "Canaries",
  Metering = "Metering",
  HostingGateway = "Hosting Gateway",
  KinesisConsumer = "Kinesis Consumer",
  DDoS = "DDoS Mitigation",
  Pipelines = "Pipelines Blocked",
  CustomerEscalations = "Customer Escalations",
  Other = "Other",
  WebhookProcessor = "Webhook Processor",
}

export interface EntriesByCategory {
  [category: string]: ReportEntry[];
}

export enum Pain {
  WorkingHours = "Working Hours",
  AfterHours = "After Hours",
  SleepingHours = "Sleeping Hours",
}
