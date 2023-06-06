import fs from "fs";
import path from "path";
import { controlPlaneAccounts, getIsengardCredentialsProvider } from "../../commons/Isengard";
import { Field, RedshiftDataClient } from "@aws-sdk/client-redshift-data";
import { AthenaClient } from "@aws-sdk/client-athena";
import { getAthenaQueryResults, startAthenaQuery, waitForAthenaQuery } from "../../commons/utils/athena";
import { getRedshiftQueryResults, startRedshiftQuery, waitForRedshiftQuery } from "../../commons/utils/redshift";

const BUSINESS_METRICS_ACCOUNT = '718161700038'
const ATHENA_BUCKET_MAP: any = {
    'us-west-2': 'aws-athena-query-results-395333095307-us-west-2'
    // TODO: fill in the rest of these
}

type AccountBill = {
    accountId: string,
    usage: number,
    billedRevenue: number,
    athenaUsage: number
}

type AccountMap = {
    [accountId: string]: AccountBill
};

type AppMap = {
    accountId: string,
    appId: string,
    region: string,
}

type AppAccountMap = {
    [accountId: string]: AppMap[]
};

const formAthenaQuery = (appsAndDomains: AppMap[], account: string): string => {
    // form apps list
    let appIdsList = ""
    for (const app of appsAndDomains) {
        if (!app.appId.includes('.')) {
            appIdsList += `'${app.appId}.cloudfront.net',`
        }
    }
    appIdsList = appIdsList.slice(0, -1)

    // form domain lists
    let domainList = ""
    for (const app of appsAndDomains) {
        if (app.appId.includes('.')) {
            domainList += `or hostheader like '%${app.appId}%'`
        }
    }
    domainList = domainList.slice(0, -1)

    return `select SUM(bytes)
    from "aemilia_cf_access_logs_db"."partitioned_parquet_logs"
    WHERE (
        host in (
            ${appIdsList}
        )
        ${domainList}    
    )`
}

const formatJsonToCsv = (accountMap: AccountMap): string => {
    let str = "accountId, usage (GB), billedRevenue, athenaUsage(GB), percentOverBilled\n"
    for (const account of Object.keys(accountMap)) {
        const overBillPercent = ((accountMap[account].usage-accountMap[account].athenaUsage)/accountMap[account].athenaUsage).toFixed(2)
        str += `${account}, ${accountMap[account].usage}, ${accountMap[account].billedRevenue}, ${accountMap[account].athenaUsage}, ${overBillPercent}\n`
    }
    return str;
}

const readAccountCSVFile = (fileName: string, limit?: number | undefined): AccountMap => {
    const accountData = fs.readFileSync(
        path.join(__dirname, `/${fileName}.csv`)
    ).toString().split("\n");
    const accountBillMap: AccountMap = {}
    let first = true;
    for (const line of accountData) {
        if (first) {
            first = false;
            continue;
        }

        if (limit) {
            limit -= 1;
            if (limit === 0) {
                console.log('at limit, returning.')
                return accountBillMap;
            }
        }
        const lineParts = line.split(',')
        const accountId = lineParts[0];
        if (accountId.length === 12) {
            accountBillMap[accountId] = {
                accountId: lineParts[0],
                usage: parseFloat(lineParts[1]),
                billedRevenue: parseFloat(lineParts[2]),
                athenaUsage: 0.0 // filled in later
            }
        }
    }
    return accountBillMap;
}

const formatResults = (accountId: string, queryRes: Field[][]): AppMap[] => {
    const apps: AppMap[] = []
    for (const record of queryRes) {
        const appId = record[0];
        const region = record[1];
        apps.push({
            accountId,
            appId: appId.stringValue!,
            region: region.stringValue!
        })
    }
    return apps;
}

const getRedshiftQueryForAccountId = (accountId: string) => {
    return `
    SELECT *
FROM   (SELECT DISTINCT appid,
                        region
        FROM   main
        WHERE  accountid = '${accountId}'
        UNION
        SELECT DISTINCT customdomainname,
                        region
        FROM   main
        WHERE  appid IN (SELECT DISTINCT appid
                         FROM   main
                         WHERE  accountid = '${accountId}')
               AND customdomainname != '')
ORDER  BY region`;
}

const main = async () => {
    const redshiftClient = new RedshiftDataClient({
        region: 'us-west-2',
        credentials: getIsengardCredentialsProvider(BUSINESS_METRICS_ACCOUNT, "RedshiftQueryRole") // todo need to create this RedshiftQueryRole
    });
    const accountBillMap: AccountMap = readAccountCSVFile('billing_acct_mismatch');
    const accounts = Object.keys(accountBillMap);
    const appMap: AppAccountMap = {}

    for (const account of accounts) {
        console.log(`getting data for: ${account}`)
        const redshiftQuery = getRedshiftQueryForAccountId(account)

        try {
            console.log(`[${account}] starting redshift query`)

            // 1) Query redshift to get the apps and domains for a customer
            const reqId = await startRedshiftQuery(redshiftClient, redshiftQuery);
            await waitForRedshiftQuery(redshiftClient, reqId)
            const res = await getRedshiftQueryResults(redshiftClient, reqId)
            const appsForAccount = formatResults(account, res);
            appMap[account] = appsForAccount;


            // 2) For each region the customer has an app in, query Athena to get their bytes used.
            const regions = Array.from(new Set(appMap[account].map((entry) => {
                return entry.region
            })));
            console.log(`[${account}] ${appsForAccount.length} apps found across ${regions.length} region(s)`)

            for (const region of regions) {
                // 3) init an Athena client in the region
                console.log(`[${account}][${region}] running athena query to get bytes usage in region ${region}`)
                const controlPLaneAccounts = (await controlPlaneAccounts()).filter((acc) => acc.stage === 'prod');
                const serviceAccountId = controlPLaneAccounts.find(account => account.region === region);
                if (!serviceAccountId) {
                    throw new Error(`cannot find account for region ${region}`);
                }
                const athenaClient = new AthenaClient({
                    region,
                    credentials: getIsengardCredentialsProvider(serviceAccountId.accountId, "AthenaReportGeneration")  // Todo Not all our accounts have this role set up.          
                });

                // 4) Query Athena to get their bytes used.
                console.log(`[${account}][${region}] starting athena query`)
                const athenaQuery = formAthenaQuery(appMap[account], account);
                const reqId = await startAthenaQuery(athenaClient, athenaQuery, ATHENA_BUCKET_MAP[region]);
                await waitForAthenaQuery(athenaClient, reqId)
                const res = await getAthenaQueryResults(athenaClient, reqId)
                const athenaBytes = parseFloat(res[1].Data![0].VarCharValue!)/1024/1024/1024; // convert to GB
                accountBillMap[account].athenaUsage += athenaBytes; // sum bytes across regions
            }
            console.log(`[${account}] total Athena bytes usage: ${accountBillMap[account].athenaUsage} `);

        } catch (e) {
            console.error("ERROR")
            console.error(e)
        } finally {
            console.log('writing file account_impact')
            fs.writeFileSync(path.join(__dirname, `/account_impact.csv`), formatJsonToCsv(accountBillMap));
        }
    }
};

main()
    .then()
    .catch((e) => {
        console.error("\nSomething went wrong");
        console.error(e);
    });
