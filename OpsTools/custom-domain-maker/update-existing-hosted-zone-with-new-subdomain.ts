import { Credentials } from "@aws-sdk/types";
import { ChangeResourceRecordSetsCommand, HostedZone, Route53Client } from "@aws-sdk/client-route-53";
import { AmplifyAccount } from "../../commons/Isengard";
import { HostedZoneWithNameServers } from "./create-new-hosted-zone-for-name";

export async function updateExistingHostedZoneWithNewSubdomain({
    accountWithAirportCode,
    credentials,
    existingHostedZone,
    newHostedZoneWithNameServers
}: {
    accountWithAirportCode: AmplifyAccount,
    credentials: Credentials,
    existingHostedZone: HostedZone,
    newHostedZoneWithNameServers: HostedZoneWithNameServers
}) {
    const route53Client = new Route53Client({
        credentials: credentials as any,
        region: accountWithAirportCode.region
    });

    const changeResourceRecordSetsCommand = new ChangeResourceRecordSetsCommand({
        HostedZoneId: existingHostedZone.Id,
        ChangeBatch: {
            Changes: [
                {
                    Action: 'CREATE',
                    ResourceRecordSet: {
                        Name: newHostedZoneWithNameServers.hostedZone.Name,
                        Type: 'NS',
                        TTL: 300,
                        ResourceRecords: newHostedZoneWithNameServers.nameServers.map(nameServer => ({
                            Value: nameServer
                        }))
                    }
                }
            ]
        }
    });

    await route53Client.send(changeResourceRecordSetsCommand);
}
