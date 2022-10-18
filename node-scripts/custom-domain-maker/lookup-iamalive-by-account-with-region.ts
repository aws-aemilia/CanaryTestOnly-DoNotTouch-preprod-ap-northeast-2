import { Route53Client, ListHostedZonesByNameCommand, HostedZone } from "@aws-sdk/client-route-53";
import { Credentials } from "@aws-sdk/types";
import { buildDnsNameFromAccountWithAirportCode } from "./build-dns-name-from-account-with-airport-code";
import { AmplifyAccount } from "../Isengard";

export async function lookupIamAliveByAccountWithAirportCode({
    accountWithAirportCode,
    credentials
}: {
    accountWithAirportCode: AmplifyAccount,
    credentials: Credentials
}): Promise<HostedZone> {
    const route53Client = new Route53Client({
        credentials: credentials as any,
        region: accountWithAirportCode.region
    });

    const dnsName = buildDnsNameFromAccountWithAirportCode(accountWithAirportCode);

    const listHostedZoneByNameCommand = new ListHostedZonesByNameCommand({
        DNSName: dnsName
    });
    const response = await route53Client.send(listHostedZoneByNameCommand);

    if(!response.HostedZones) {
        throw new Error(`No Hosted zones were returned for dns name: ${dnsName} in account ${accountWithAirportCode.accountId} in region: ${accountWithAirportCode.region}`);
    }

    const hostedZone = response.HostedZones.find(hostedZone => hostedZone.Name === `${dnsName}.`);

    if(!hostedZone) {
        throw new Error(`Hosted zone not found for dns name: ${dnsName} in account ${accountWithAirportCode.accountId} in region: ${accountWithAirportCode.region}`);
    }

    return hostedZone;
}