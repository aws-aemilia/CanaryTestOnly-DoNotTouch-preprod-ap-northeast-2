import {
  APIGatewayClient,
  UpdateDomainNameCommand,
  SecurityPolicy,
} from "@aws-sdk/client-api-gateway";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import {
  controlPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../Commons/Isengard";

async function main() {
  const args = await yargs(hideBin(process.argv))
    .usage(
      `
    To run against known domains:
    npx ts-node setMinTLSVersionAPIGW.ts --domain amplify.ap-east-1.amazonaws.com
    npx ts-node setMinTLSVersionAPIGW.ts --domain amplify.ap-east-1.amazonaws.com --rollback

    To test on personal account you can use:
    npx ts-node setMinTLSVersionAPIGW.ts --domain amplify.plisy.people.aws.dev --accountId 972095496040 --region us-west-2 --role OncallOperator
    npx ts-node setMinTLSVersionAPIGW.ts --domain amplify.plisy.people.aws.dev --accountId 972095496040 --region us-west-2 --role OncallOperator --rollback
    `
    )
    .option("domain", {
      describe:
        "i.e. amplify.ap-east-1.amazonaws.com - when a known domain provided, accountId and region are set automatically",
      type: "string",
      demandOption: true,
    })
    .option("accountId", {
      describe: "i.e. 574285171994 - required unless known domain provided",
      type: "string",
      demandOption: false,
    })
    .option("region", {
      describe: "i.e. us-west-2 - required unless known domain provided",
      type: "string",
      demandOption: false,
    })
    .option("role", {
      describe: "i.e. OncallOperator",
      type: "string",
      demandOption: false,
    })
    .option("rollback", {
      type: "boolean",
      demandOption: false,
    })
    .strict()
    .version(false)
    .help().argv;

  let props: Partial<UpdateProps> = {};
  props.role = args.role ?? "OncallOperator";
  props.domain = args.domain;

  props.securityPolicy = args.rollback
    ? SecurityPolicy.TLS_1_0
    : SecurityPolicy.TLS_1_2;

  if (/amplify\.[\w\d-]+\.amazonaws\.com/.test(args.domain)) {
    const region = args.domain.split(".")[1];

    // Safe, this throws if account not found.
    const acc = await controlPlaneAccount("prod" as Stage, region as Region);
    props.accountId = acc.accountId;
    props.region = acc.region;
  } else if (/(beta|gamma|preprod)\.[\w\d-]+\.controlplane\.amplify\.aws\.dev/.test(args.domain)) {
    const stage = args.domain.split(".")[0] as Stage;
    const region = args.domain.split(".")[1] as Region;

    const acc = await controlPlaneAccount(stage, region);
    props.accountId = acc.accountId;
    props.region = acc.region;
  } else {
    if (!args.accountId || !args.region) {
      console.error(
        "You need to specify either a known domain, or both accountId and region"
      );
      return;
    }
    props.accountId = args.accountId;
    props.region = args.region;
  }

  await updateMinTLSVersionForDomain(props as UpdateProps);
}

type UpdateProps = {
  accountId: string;
  region: string;
  domain: string;
  role: string;
  securityPolicy: SecurityPolicy;
};

/**
 * This function requires following permissions to work.
    {
      "Sid": "EnforceTLS12",
      "Effect": "Allow",
      "Action": [
          "apigateway:PATCH"
      ],
      "Resource": [
          "arn:aws:apigateway:*::/domainnames",
          "arn:aws:apigateway:*::/domainnames/*"
      ],
      "Condition": {
          "ForAllValues:StringEquals": {
              "apigateway:Request/SecurityPolicy": ["TLS_1_2", "TLS_1_0"]
          }
      }
    }
 */
async function updateMinTLSVersionForDomain({
  accountId,
  region,
  domain,
  role,
  securityPolicy,
}: UpdateProps) {
  const client = new APIGatewayClient({
    region: region,
    credentials: getIsengardCredentialsProvider(accountId, role),
  });

  const res = await client.send(
    new UpdateDomainNameCommand({
      domainName: domain,
      patchOperations: [
        {
          op: "replace",
          path: "/securityPolicy",
          value: securityPolicy,
        }
      ],
    })
  );

  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
