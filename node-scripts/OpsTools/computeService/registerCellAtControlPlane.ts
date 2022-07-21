import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  computeServiceControlPlaneAccount,
  computeServiceDataPlaneAccount,
  getIsengardCredentialsProvider,
  Region,
  Stage,
} from "../../Isengard";
import yargs from "yargs";

const TABLE_NAME = "CellAccounts";


const registerAccount = async(stage: Stage, region:Region, cellNumber:number) => {
    const controlPlaneAccount = await computeServiceControlPlaneAccount(stage, region);
    const cellAccount = await computeServiceDataPlaneAccount(stage, region, cellNumber);

    console.log(`registering cell account ${cellAccount.accountId} - ${cellAccount.email}`);

    const dynamodb = new DynamoDBClient({
        region: controlPlaneAccount.region,
        credentials: getIsengardCredentialsProvider(controlPlaneAccount.accountId, 'OncallOperator'),
    });

    const command = new PutCommand({
        Item: {
            accountId: cellAccount.accountId,
        },
        TableName: TABLE_NAME,
    });

    await dynamodb.send(command);
    console.log('SUCCESS');
}

const main = async () => {

    const args = await yargs(process.argv.slice(2))
        .usage(
            `
Registers a cell account by writing an entry to the CellAccounts DDB table
`
        )
        .option("stage", {
            describe: "stage to run the command",
            type: "string",
            choices: ["beta", "gamma", "prod"],
            demandOption: true,
        })
        .option("region", {
            describe: "region to run the command. e.g. us-west-2",
            type: "string",
            demandOption: true,
        })
        .option("cellNumber", {
            describe: "cell number. e.g. 1",
            type: "number",
            demandOption: true,
        })
        .strict()
        .version(false)
        .help().argv;

    const {stage, region, cellNumber} = args

    await registerAccount(stage as Stage, region as Region, cellNumber);
}

main()
    .then()
    .catch((e) => {
        console.log("\nSomething went wrong");
        console.log(e);
    });
