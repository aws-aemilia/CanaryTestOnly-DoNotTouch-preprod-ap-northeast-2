import { Category, EntriesByCategory, ReportEntry } from "./types";

interface CategoryMapping {
  pattern: string | RegExp;
  category: Category;
}

// Maps Ticket subjects to categories.
// The pattern can be a string literal or a RegExp.
const categoryMappings: CategoryMapping[] = [
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
    pattern: "Pipeline blocked",
    category: Category.Pipelines,
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
];

export function getCategory(pageSubject: string): Category {
  // Evaluate the page subject against all category mappings, the first one that matches wins.
  const mapping: CategoryMapping | undefined = categoryMappings.find((mapping: CategoryMapping) => {
    if (typeof mapping.pattern === "string") {
      return pageSubject.includes(mapping.pattern);
    } else {
      return mapping.pattern.test(pageSubject);
    }
  });

  if (!mapping) {
    return Category.Other;
  }

  return mapping.category;
}

export function groupByCategory(
  reportEntries: ReportEntry[]
): EntriesByCategory {
  return reportEntries.reduce((acc: EntriesByCategory, entry: ReportEntry) => {
    const category = entry.category;
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(entry);
    return acc;
  }, {});
}
