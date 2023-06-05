import { Credentials } from "@aws-sdk/types";
import { CreateHostedZoneCommand, HostedZone, Route53Client } from "@aws-sdk/client-route-53";
import { buildDnsNameFromAccountWithAirportCode} from './build-dns-name-from-account-with-airport-code';
import { AmplifyAccount } from '../commons/Isengard';

export interface HostedZoneWithNameServers {
    hostedZone: HostedZone,
    nameServers: string[]
};

export async function createNewHostedZoneForName({
    accountWithAirportCode,
    credentials,
    newSubdomain
}: {
    accountWithAirportCode: AmplifyAccount,
    credentials: Credentials,
    newSubdomain: string,
}): Promise<HostedZoneWithNameServers> {
    const route53Client = new Route53Client({
        credentials: credentials as any,
        region: accountWithAirportCode.region
    });

    const dnsName = buildDnsNameFromAccountWithAirportCode(accountWithAirportCode);

    console.log(`Creating new subdomain hosted zone: ${newSubdomain}.${dnsName}`);
    const createHostedZoneCommand = new CreateHostedZoneCommand({
        Name: `${newSubdomain}.${dnsName}`,
        CallerReference: (new Date()).toString()
    });

    const response = await route53Client.send(createHostedZoneCommand);

    if(!response.DelegationSet || !response.DelegationSet.NameServers) {
        throw new Error('Failed with partially created HostedZone - a DelegationSet with NameServers was not returned');
    }

    if(!response.HostedZone) {
        throw new Error('Failed with partially created HostedZone - The HostedZone was not returned with the response');
    }

    const nameServersWithRequiredPeriodEnding = response.DelegationSet.NameServers.map(nameServer => `${nameServer}.`);

    return {
        hostedZone: response.HostedZone,
        nameServers: nameServersWithRequiredPeriodEnding
    };
}
