import {
  GetWebACLCommand,
  ListWebACLsCommand,
  Scope,
  WAFV2Client,
} from "@aws-sdk/client-wafv2";
import {
  AmplifyAccount,
  controlPlaneAccounts,
  getIsengardCredentialsProvider,
} from "../../commons/Isengard";

require("util").inspect.defaultOptions.depth = null;

async function main() {
  const accs = await controlPlaneAccounts({ stage: "prod" });

  console.log("\n");
  for (const acc of accs) {
    const regionSummary = await getRegionSummary(acc);
    console.log(acc.airportCode.toUpperCase());
    console.log(regionSummary);
    console.log("======================================");
  }
}

async function getRegionSummary(acc: AmplifyAccount): Promise<string[]> {
  const wafClient = new WAFV2Client({
    region: "us-east-1",
    credentials: getIsengardCredentialsProvider(acc.accountId, "ReadOnly"),
  });

  const listWebACLsCommand = new ListWebACLsCommand({
    Scope: Scope.CLOUDFRONT,
    Limit: 100,
  });

  const listWebACLsCommandOutput = await wafClient.send(listWebACLsCommand);

  const map: Promise<string>[] = listWebACLsCommandOutput.WebACLs!.map(
    async (webACL) => {
      return getRulesSummary(wafClient, webACL.Id!, webACL.Name!);
    }
  );

  return await Promise.all(map);
}

async function getRulesSummary(
  wafClient: WAFV2Client,
  Id: string,
  Name: string
) {
  const getWebACLCommandOutput = await wafClient.send(
    new GetWebACLCommand({ Id, Name, Scope: Scope.CLOUDFRONT })
  );

  if (getWebACLCommandOutput!.WebACL!.Rules!.length === 0) {
    return `${
      getWebACLCommandOutput.WebACL!.Name
    }: No rules. This is unexpected`;
  }

  const rules = getWebACLCommandOutput!.WebACL!.Rules!;

  let output = `${getWebACLCommandOutput.WebACL!.Name}: `;

  const ruleSummary = rules.map((rule) => {
    return `(${rule.Name}, ${rule.Statement?.RateBasedStatement?.AggregateKeyType}, ${rule.Statement?.RateBasedStatement?.Limit})`;
  });

  return output + ruleSummary.join(", ");
}

main().then(console.log).catch(console.error);
