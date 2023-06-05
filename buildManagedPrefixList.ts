import { EC2 } from "aws-sdk";
import { AmplifyAccount, controlPlaneAccounts, dataPlaneAccounts, getIsengardCredentialsProvider } from "./commons/Isengard";

/**
 * Prints the AWS Managed prefixes for CloudFront origin facing IPs for all regions in the format expected by AWSAmplifyDataplaneCDK,
 * Ref: https://aws.amazon.com/blogs/networking-and-content-delivery/limit-access-to-your-origins-using-the-aws-managed-prefix-list-for-amazon-cloudfront/
 * Usage:
 * ts-node buildManagedPrefixList.ts
 */
const main = async () => {
  const accounts = await dataPlaneAccounts({ stage: "prod" });
  const regionPrefixMapping: { [regionName: string]: string } = {};

  for (let account of accounts) {
    console.info(account);
    const prefix = await getPrefixesForRegion(account, "com.amazonaws.global.cloudfront.origin-facing");
    if (!prefix.PrefixLists || prefix.PrefixLists.length !== 1) {
      console.error("Error finding matching prefix in the region", account.region, prefix);
      return;
    }
    regionPrefixMapping[account.region] = prefix.PrefixLists![0].PrefixListId!;
  };

  console.info("#### CloudFront Origin Facing Prefixes by Region ####");
  console.info(JSON.stringify(regionPrefixMapping));
};

async function getPrefixesForRegion(account: AmplifyAccount, prefixName: string) {
  const credentialsProvider = getIsengardCredentialsProvider(
    account.accountId,
    "ReadOnly"
  );

  const credentials = await credentialsProvider();
  const ec2 = new EC2({ region: account.region, credentials });

  return new Promise<EC2.DescribeManagedPrefixListsResult>((res, rej) => {
    ec2.describeManagedPrefixLists({
      Filters: [{
        Name: "prefix-list-name",
        Values: [prefixName]
      }],
    }, function (err, data) {
      if (err) rej(err);
      else res(data)
    });
  })

}

main().then().catch(console.error);

