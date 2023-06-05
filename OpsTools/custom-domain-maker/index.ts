import { createNewHostedZoneForName } from './create-new-hosted-zone-for-name';
import { getNewSubdomainFromUserInput } from './get-new-subdomain-from-user-input';
import { lookupIamAliveByAccountWithAirportCode } from './lookup-iamalive-by-account-with-region';
import { updateExistingHostedZoneWithNewSubdomain } from './update-existing-hosted-zone-with-new-subdomain';
import { AmplifyAccount, controlPlaneAccounts } from '../../Commons/Isengard/accounts';
import { getIsengardCredentialsProvider } from '../../Commons/Isengard';
import { Credentials } from "@aws-sdk/types";
import { exitIfNotContinuing } from './exit-if-not-continuing';

const DANGEROUS_ROLE_ALLOWING_CHANGES_TO_BE_COMMITTED = 'OncallOperator';

(async function () {
    const allAccountResults = await Promise.all([
        controlPlaneAccounts({ stage: 'beta' }),
        controlPlaneAccounts({ stage: 'gamma' }),
        controlPlaneAccounts({ stage: 'prod' })
    ]);

    const allAccountsWithAirportCodes: AmplifyAccount[] = allAccountResults.flat();

    const newSubdomain = await getNewSubdomainFromUserInput(allAccountsWithAirportCodes);
    console.log({newSubdomain});

    for(const accountWithAirportCode of allAccountsWithAirportCodes) {
        console.log(`Getting credentials for region: ${accountWithAirportCode.airportCode}`);

        const credentials: Credentials = await getIsengardCredentialsProvider(accountWithAirportCode.accountId, DANGEROUS_ROLE_ALLOWING_CHANGES_TO_BE_COMMITTED)();

        console.log(`Looking up existing zone`);
        const existingHostedZone = await lookupIamAliveByAccountWithAirportCode({ accountWithAirportCode, credentials });
        console.log(`Existing zone name: ${existingHostedZone.Name}`);

        console.log('------------------------------------\n\n');
        console.log(`Are you sure you want to add the new subdomain: ${newSubdomain} to the following:`);
        console.log(`Stage: ${accountWithAirportCode.stage}`);
        console.log(`Region: ${accountWithAirportCode.region}`);
        console.log(`Hosted Zone: ${existingHostedZone.Name}\n\n`);
        console.log('------------------------------------\n\n');
        await exitIfNotContinuing();

        console.log('Creating new hosted zone');
        const newHostedZoneWithNameServers = await createNewHostedZoneForName({ accountWithAirportCode, credentials, newSubdomain });
        console.log(`new HostedZone created: ${newHostedZoneWithNameServers.hostedZone.Name}`);

        console.log(`Adding new subdomain: ${newHostedZoneWithNameServers.hostedZone.Name} to existing HostedZone`);
        await updateExistingHostedZoneWithNewSubdomain({
            accountWithAirportCode,
            credentials,
            existingHostedZone,
            newHostedZoneWithNameServers
        });
        console.log(`Success for stage: ${accountWithAirportCode.stage} region: ${accountWithAirportCode.airportCode}\n\n------------------------------\n\n`);
    }

    console.log(allAccountsWithAirportCodes);
})().catch(console.error)
