import sleep from "./utils/sleep"
import fs from "fs"
import { AmplifyAccount, controlPlaneAccount, getIsengardCredentialsProvider, Region, Stage } from "./Isengard"
import { toRegionName, toAirportCode } from "./utils/regions"
import { ReceiveMessageCommand, SendMessageCommand, SQS } from "@aws-sdk/client-sqs"

let ACCOUNT_BEING_PROCESSED: string | null = null
let ACCOUNT_IDX_BEING_PROCESSED: number | null = null

const WORKING_DIRECTORY: string = "FTM"
const LAST_PROCESSED_FILENAME: string = `start-process-accountid`
const LAST_PROCESSED_FILE_PATH: string = `${WORKING_DIRECTORY}/${LAST_PROCESSED_FILENAME}.json`
const STAGE: Stage = "prod"
const REGION_NAME: Region = "us-east-1"
const REGION_AIRPORT: Region = "IAD"
const RATE_LIMIT_WAIT_TIME: number = 2000 // https://t.corp.amazon.com/P76377998 https://quip-amazon.com/3l3gAlTIjHc5/FTM-Script-Design-Doc

enum FreeTierMigrationAgent {
    CONTROL_PLANE = "CONTROL_PLANE",
    MANUAL = "MANUAL",
    OTHER = "OTHER",
}

const freeTierMigrationQueue = (amplifyAccount: AmplifyAccount): string => {
    return `https://sqs.${amplifyAccount.region}.amazonaws.com/${amplifyAccount.accountId}/FreeTierMigrationQueue`
}

const freeTierMigrationDLQQueue = (amplifyAccount: AmplifyAccount): string => {
    return `https://sqs.${amplifyAccount.region}.amazonaws.com/${amplifyAccount.accountId}/FreeTierMigrationDLQ`
}

const buildAccountMigrationMessage = (accountId: string) => {
    return {
        accountId,
        freeTierMigrationAgent: FreeTierMigrationAgent.MANUAL,
        skipLocalAccountMigrationStatusCheck: false
    }
}

const getAccountIdIdxToStartProcessing = (): number => {
    let startProcessIdx = 0
    if (fs.existsSync(LAST_PROCESSED_FILE_PATH)) {
        console.log(`Found ${LAST_PROCESSED_FILE_PATH} file to start processing from.`)
        const account = JSON.parse(fs.readFileSync(LAST_PROCESSED_FILE_PATH, "utf8"));
        console.log(JSON.stringify(account))
        startProcessIdx = Number(account.accountIdIdx)
    }
    return startProcessIdx
}

const main = async () => {
    
    // load in list of AWS AccountIds to migrate for the region.
    const inputAccountIdsFilePath = `${WORKING_DIRECTORY}/accounts-to-migrate.csv`
    if (!fs.existsSync(inputAccountIdsFilePath))
        throw new Error(`Expected to find input data file "${inputAccountIdsFilePath}" but the path does not exist.`)
    const data = fs.readFileSync(inputAccountIdsFilePath, "utf8")
    const accountIds = data.split(/\r?\n/)

    // check if the script was previously ran and we should pick up processing from a certain account id
    const startProcessIdx = getAccountIdIdxToStartProcessing()

    // init the sqs client for the region
    const controlPlaneAccount_ = await controlPlaneAccount(STAGE, REGION_AIRPORT)
    const role = STAGE === "prod" ? "FullReadOnly" : "ReadOnly" // todo update to specific role for write only permissions to FreeTierMigration SQS queue
    const sqs = new SQS({
      region: REGION_NAME,
      credentials: getIsengardCredentialsProvider(
        controlPlaneAccount_.accountId,
        role
      ),
    })

    // send message to the SQS queue to migrate the accounts
    for (let i = startProcessIdx; i < accountIds.length; i++) {
        if (i === 0) continue // first row will be the csv column titles

        ACCOUNT_BEING_PROCESSED = accountIds[i]
        ACCOUNT_IDX_BEING_PROCESSED = i
        try {
            const message = new SendMessageCommand({
                QueueUrl: freeTierMigrationQueue(controlPlaneAccount_),
                MessageBody: JSON.stringify(buildAccountMigrationMessage(ACCOUNT_BEING_PROCESSED)),
            })
            await sqs.send(message)
            console.log(`sent message: ${JSON.stringify(message)}`)
            console.log(`progress: ${((i/accountIds.length)*100.0).toFixed(2)} %`)

            console.log(`checking DLQ for messages`)
            const checkDLQResponse = await sqs.send(new ReceiveMessageCommand({
                QueueUrl: freeTierMigrationDLQQueue(controlPlaneAccount_)
            }))
            if (checkDLQResponse && checkDLQResponse.Messages && checkDLQResponse.Messages.length > 0) {
                throw new Error("Found messages in the FreeTierMigrationDLQ. Stop processing for now.")
            }
        } catch(err) {
            console.warn(`Failed to send message for accountId ${ACCOUNT_BEING_PROCESSED}`)            
            console.warn(err)
            throw err
        } finally {
            await sleep(RATE_LIMIT_WAIT_TIME)
        }
    }
    console.log(`Finished migration accounts in ${inputAccountIdsFilePath}`)
}

const runShutDownSequence = () => {
    console.log("")
    console.log("Caught interrupt signal");
    console.log(`ACCOUNT_BEING_PROCESSED: ${ACCOUNT_BEING_PROCESSED}`);
    const data = { accountId: ACCOUNT_BEING_PROCESSED, accountIdIdx: ACCOUNT_IDX_BEING_PROCESSED }
    console.log(`writing data to pick up for next script run`);
    console.log(`file: ${LAST_PROCESSED_FILE_PATH}`);
    console.log(`data: ${JSON.stringify(data)}`);
    console.log("")
    fs.writeFileSync(LAST_PROCESSED_FILE_PATH, JSON.stringify(data))
    process.exit();
}

process.on("SIGQUIT", runShutDownSequence);
process.on("SIGTERM", runShutDownSequence);
process.on("SIGINT", runShutDownSequence);
main()
.then()
.catch(() => {
    runShutDownSequence()
})
