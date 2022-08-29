import {
    ChangeResourceRecordSetsCommand,
    ChangeResourceRecordSetsCommandInput,
    InvalidChangeBatch,
    Route53Client,
} from "@aws-sdk/client-route-53";
import { getIsengardCredentialsProvider } from "../Isengard";
import { ChangeBatch } from "aws-sdk/clients/route53";

export const DOMAIN_ACCOUNT = "673144583891"; // aws-mobile-aemilia-domain@amazon.com

export const changeResourceRecordSetsInGlobalAccount = async (hostedZoneId: string, changeBatch: ChangeBatch) => {
    const route53Client = new Route53Client({
        credentials: getIsengardCredentialsProvider(
            DOMAIN_ACCOUNT,
            "Route53Manager"
        ),
    });

    const changeResourceRecordSetsCommandInput: ChangeResourceRecordSetsCommandInput = {
        ChangeBatch: changeBatch,
        HostedZoneId: hostedZoneId,
    };

    try {
        console.log('Calling ChangeResourceRecordSets with: ', JSON.stringify(changeResourceRecordSetsCommandInput, null, 2));
        const changeResourceRecordSetsCommand = new ChangeResourceRecordSetsCommand(changeResourceRecordSetsCommandInput);
        await route53Client.send(changeResourceRecordSetsCommand);
    } catch (e) {
        if (
            e instanceof InvalidChangeBatch &&
            e.message.includes("already exists")
        ) {
            console.log(
                "The validation records already exists. This is ok. Error was:",
                e.message
            );
        } else {
            throw e;
        }
    }
}
