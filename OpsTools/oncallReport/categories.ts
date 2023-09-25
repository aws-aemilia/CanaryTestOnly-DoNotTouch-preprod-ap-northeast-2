import { Category, EntriesByCategory, ReportEntry } from "./types";

interface CategoryMapping {
  pattern: string | RegExp;
  category: Category;
}

// Maps Ticket subjects to categories.
// The pattern can be a string literal or a RegExp.
const categoryMappings: CategoryMapping[] = [
  {
    pattern: "Pipeline blocked",
    category: Category.Pipelines,
  },
  {
    pattern: "AemiliaCanaryLambda",
    category: Category.Canaries,
  },
  {
    pattern: "AmplifyHostingCanary",
    category: Category.Canaries,
  },
  {
    pattern: "AemiliaControlPlaneService",
    category: Category.ControlPlane,
  },
  {
    pattern: "AemiliaWarmingPool",
    category: Category.WarmingPool,
  },
  {
    pattern: "AWSAmplifyMeteringService",
    category: Category.Metering,
  },
  {
    pattern: "ddos_mitigation_succeeded",
    category: Category.DDoS,
  },
  {
    pattern: "AmplifyHostingKinesisConsumer",
    category: Category.KinesisConsumer,
  },
  {
    pattern: "Amplify Hosting Gateway",
    category: Category.HostingGateway,
  },
  {
    pattern: new RegExp(/- Case \d{11}/),
    category: Category.CustomerEscalations,
  },
  {
    pattern: "AemiliaWebhookProcessorService",
    category: Category.WebhookProcessor,
  },
];

export function getCategory(pageSubject: string): Category {
  // Evaluate the page subject against all category mappings, the first one that matches wins.
  const mapping: CategoryMapping | undefined = categoryMappings.find(
    (mapping: CategoryMapping) => {
      if (typeof mapping.pattern === "string") {
        return pageSubject.includes(mapping.pattern);
      } else {
        return mapping.pattern.test(pageSubject);
      }
    }
  );

  if (!mapping) {
    return Category.Other;
  }

  return mapping.category;
}

function extractTicketIdIfHasExactlyOneTicketLink(text: string): string | null {
  const linkRegex = /https:\/\/t.corp.amazon.com\/[A-Z0-9]+/g;
  const matches = text.match(linkRegex);
  if (matches && matches.length === 1) {
    return matches[0].replace("https://t.corp.amazon.com/", "");
  }
  return null;
}

/**
 * Returns the category of the entry based on the following rules:
 * <br>
 * 1. If the entry has root cause ticket whose frequency exceeds the threshold, the ticket ID is returned as category
 * 2. Otherwise the corresponding category from the CategoryMapping is returned
 */
function getSmartCategory(
  entry: ReportEntry,
  ticketFrequency: { [ticketId: string]: number },
  commonRootCauseThreshold: number
): string | Category {
  if (!entry.ticketId) {
    return getCategory(entry.pageSubject);
  }

  if (ticketFrequency[entry.ticketId] >= commonRootCauseThreshold) {
    return entry.ticketId;
  }

  const extractedTicketId = extractTicketIdIfHasExactlyOneTicketLink(
    entry.rootCause ?? ""
  );

  if (
    extractedTicketId &&
    ticketFrequency[extractedTicketId] >= commonRootCauseThreshold
  ) {
    return extractedTicketId;
  }

  return getCategory(entry.pageSubject);
}

export function groupByCategory(
  reportEntries: ReportEntry[],
  commonRootCauseThreshold: number
): EntriesByCategory {
  const ticketFrequency = reportEntries.reduce(
    (acc: { [ticketId: string]: number }, entry: ReportEntry) => {
      const extractedTicketId = extractTicketIdIfHasExactlyOneTicketLink(
        entry.rootCause ?? ""
      );
      if (extractedTicketId) {
        acc[extractedTicketId] = acc[extractedTicketId] ?? 0;
        acc[extractedTicketId]++;
      }
      if (entry.ticketId) {
        acc[entry.ticketId] = acc[entry.ticketId] ?? 0;
        acc[entry.ticketId]++;
      }
      return acc;
    },
    {}
  );

  return reportEntries.reduce((acc: EntriesByCategory, entry: ReportEntry) => {
    const category = getSmartCategory(
      entry,
      ticketFrequency,
      commonRootCauseThreshold
    );
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(entry);
    return acc;
  }, {});
}
