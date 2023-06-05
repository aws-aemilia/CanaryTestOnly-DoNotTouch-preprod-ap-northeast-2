import fs from "fs";
import { getRecordsFromHostedZone, getRoute53Client } from "../../commons/route53";
import { dataPlaneAccounts, Stage } from "../../commons/Isengard";

async function main() {
  // Root hosted zone (gateway.amplify.aws.dev) is the one that currently holds all of
  // the subdomains for all stages and regions.
  const rootHostedZoneId = "Z06330931XFXCBAZV8FES";
  const prodRoute53 = getRoute53Client("prod", true);
  const stages: Stage[] = ["beta", "gamma", "prod"];

  for (const stage of stages) {
    const accounts = await dataPlaneAccounts({ stage });

    for (const account of accounts) {
      const regionName = account.region;
      const regionalDomainName = `${stage}.${regionName}.gateway.amplify.aws.dev`;

      const records = await getRecordsFromHostedZone(
        prodRoute53,
        rootHostedZoneId,
        regionalDomainName,
        "ANY"
      );

      // Add the wildcard record
      records.push({
        Name: `*.${regionalDomainName}`,
        Type: "CNAME",
        TTL: 300,
        ResourceRecords: [
          {
            Value: regionalDomainName,
          },
        ],
      });

      // Add email TXT to prevent spoofing
      records.push({
        Name: regionalDomainName,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [
          {
            Value: '"v=spf1 -all"',
          },
        ],
      });

      records.push({
        Name: `_dmarc.${regionalDomainName}`,
        Type: "TXT",
        TTL: 1800,
        ResourceRecords: [
          {
            Value:
              '"v=DMARC1; p=reject; rua=mailto:report@dmarc.amazon.com; ruf=mailto:report@dmarc.amazon.com"',
          },
        ],
      });

      const fileName = `dns-records/${stage}-${regionName}.json`;
      fs.writeFileSync(fileName, JSON.stringify(records, null, 2));
    }
  }
}

main();
