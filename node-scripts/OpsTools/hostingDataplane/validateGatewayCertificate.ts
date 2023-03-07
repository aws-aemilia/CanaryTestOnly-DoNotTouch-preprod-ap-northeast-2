import {
  ACMClient,
  CertificateDetail,
  CertificateStatus,
  DescribeCertificateCommand,
  ListCertificatesCommand,
  ResourceRecord,
} from "@aws-sdk/client-acm";
import {
  AmplifyAccount,
  dataPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import sleep from "../../utils/sleep";
import yargs from "yargs";
import { getDomainName, HOSTED_ZONE_ID } from "./utils/utils";
import { updateRecordsInHostedZone, getRoute53Client } from "../../route53";
import { ChangeBatch } from "aws-sdk/clients/route53";

const pollDelayMilliseconds = 30_000;

const addValidationRecords = async (stage: Stage, resourceRecord: ResourceRecord) => {
  const changeBatch: ChangeBatch = {
    Changes: [
      {
        Action: "CREATE",
        ResourceRecordSet: {
          Type: resourceRecord.Type!,
          Name: resourceRecord.Name!,
          ResourceRecords: [{ Value: resourceRecord.Value! }],
          TTL: 300,
        },
      },
    ],
    Comment: "Add ACM validation records",
  };

  const route53Client = getRoute53Client(stage);
  await updateRecordsInHostedZone(route53Client, HOSTED_ZONE_ID, changeBatch);
};

const getGatewayCertificate: (
  account: AmplifyAccount
) => Promise<CertificateDetail | undefined> = async (
  account: AmplifyAccount
) => {
  const domainName = getDomainName(
    account.stage,
    account.region
  );
  const acmClient = new ACMClient({
    region: account.region,
    credentials: getIsengardCredentialsProvider(account.accountId),
  });

  console.log(`looking for certificate for domain ${domainName}`);
  const listCertificatesCommandOutput = await acmClient.send(
    new ListCertificatesCommand({})
  );

  const cert = listCertificatesCommandOutput.CertificateSummaryList?.find(
    (x) => {
      return x.DomainName === domainName;
    }
  );

  if (!cert) {
    console.log(`There are no gateway certificates for domain ${domainName}`);
    console.log(
      "All ACM certificates in account:",
      listCertificatesCommandOutput.CertificateSummaryList
    );
    return undefined;
  }

  console.log(`found certificate ${cert.CertificateArn}`);

  new DescribeCertificateCommand({ CertificateArn: cert.CertificateArn });

  const describeCertificateCommandOutput = await acmClient.send(
    new DescribeCertificateCommand({ CertificateArn: cert.CertificateArn })
  );

  return describeCertificateCommandOutput.Certificate;
};

const waitForAndValidtaeACMCertificate = async (
  stage: Stage,
  region: Region
) => {
  const account = await dataPlaneAccount(
    stage,
    region
  );

  let cert: CertificateDetail | undefined;
  do {
    cert = await getGatewayCertificate(account);
    if (!cert) {
      await sleep(pollDelayMilliseconds);
    }
  } while (cert === undefined);

  const status = cert?.Status;
  const dnsValidationRecord = cert.DomainValidationOptions?.[0].ResourceRecord!;
  switch (status) {
    case CertificateStatus.EXPIRED:
    case CertificateStatus.FAILED:
    case CertificateStatus.INACTIVE:
    case CertificateStatus.REVOKED:
    case CertificateStatus.VALIDATION_TIMED_OUT:
      throw new Error(`The certificate is on a failed state: ${status}`);
    case CertificateStatus.ISSUED:
      console.log("The certificate is already issued. All is good");
      break;
    case CertificateStatus.PENDING_VALIDATION:
      console.log("certificate is pending validation");
      await addValidationRecords(stage, dnsValidationRecord);
      console.log("Successfully added validation records to route53");
      break;
  }
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `
Finds the ACM certificate for the hosting gateway and performs dns validation by adding CNAME records on the gateway.amplify.aws.dev hosted zone

For convenience this tool polls for ACM certs until it finds one, so you can run the tool before the CFN deployment and have the certificate validated as soon as it is created.
`
    )
    .option("stage", {
      describe: "stage to run the command",
      type: "string",
      choices: ["beta", "gamma", "prod"],
      demandOption: true,
    })
    .option("region", {
      describe: "region to run the command. e.g. us-west-2",
      type: "string",
      demandOption: true,
    })
    .strict()
    .version(false)
    .help().argv;

  const { stage, region } = args;

  await waitForAndValidtaeACMCertificate(
    stage as Stage,
    region as Region,
  );
};

main()
  .then()
  .catch((e) => {
    console.log("\nSomething went wrong");
    console.log(e);
  });
