import {
  AmplifyAccount,
  computeServiceControlPlaneAccount,
  computeServiceDataPlaneAccount,
  createComputeServiceCellAccount,
  createComputeServiceControlPlaneAccount,
  createDataPlaneAccount,
  dataPlaneAccount,
  Region,
  Stage,
} from "../Commons/Isengard";
import yargs from "yargs";
import { deleteCache } from "../Commons/Isengard/cache";
import { increaseIAMRoles } from "../Commons/service-quotas";
import sleep from "../Commons/utils/sleep";
import {
  requestComputeCellLambdaConcurrency,
  requestMaxLambdaConcurrency,
  requestMaxLambdaStorage
} from "../Commons/SimT/LambdaLimitIncrease";

// TODO: add this type to the AmplifyAccount type and update Isengard cache
type AmplifyAccountType = "computeServiceControlPlane" |  "computeServiceCell" | "dataPlane"; 

const cutTicketsLambdaLimitIncrease = async (createdAccount: AmplifyAccount, type: AmplifyAccountType): Promise<void> => {
    console.log("Cutting tickets to request Lambda limit increases");
    const concurrencyTicket =
      type === "computeServiceCell"
        ? await requestComputeCellLambdaConcurrency(createdAccount)
        : await requestMaxLambdaConcurrency(createdAccount);
    console.log(`concurrency increase: https://t.corp.amazon.com/${concurrencyTicket}`);

    await sleep(3_000); // avoid throttles

    const storageTicket = await requestMaxLambdaStorage(createdAccount);
    console.log(`code storage increase: https://t.corp.amazon.com/${storageTicket}`);
}

const main = async ()=> {

    const args = await yargs(process.argv.slice(2))
        .usage(
            `
Create an Isengard AWS account

** Requires mcurl to be installed. install it with https://w.amazon.com/bin/view/NextGenMidway/UserGuide#Client_Environment_Setup_.28for_CLI_or_SSH.29 **
`
        )
        .option("type", {
            describe: "type of account.",
            type: "string",
            choices: ["computeServiceControlPlane", "computeServiceCell", "dataPlane"],
            demandOption: true,
        })
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
        })
        .strict()
        .version(false)
        .help().argv;

    const {cellNumber, type} = args
    const stage = args.stage as Stage;
    const region = args.region as Region;

    switch (type) {
        case 'computeServiceControlPlane':
            await createComputeServiceControlPlaneAccount(stage , region);
            console.log('SUCCESS')
            console.log('Refreshing the local account cache...')
            await deleteCache('computeServiceControlPlaneAccounts');
            const computeAccount = await computeServiceControlPlaneAccount(stage, region)
            await cutTicketsLambdaLimitIncrease(computeAccount, type)
            break;
        case 'computeServiceCell':
            await createComputeServiceCellAccount(stage, region, cellNumber);
            console.log('SUCCESS')
            console.log('Refreshing the local account cache...')
            await deleteCache('computeServiceDataPlaneAccounts');
            const cellAccount = await computeServiceDataPlaneAccount(stage, region, cellNumber!)
            await cutTicketsLambdaLimitIncrease(cellAccount, type)
            await increaseIAMRoles(cellAccount);
            break;
        case 'dataPlane':
          await createDataPlaneAccount(stage, region, cellNumber);
          console.log('SUCCESS')
          console.log('Refreshing the local account cache...')
          await deleteCache('dataPlaneAccounts');
          await dataPlaneAccount(stage, region)
          break;
        default:
            throw new Error('unrecognized account type');
    }
}

main()
    .then()
    .catch((e) => {
        console.log("\nSomething went wrong");
        console.log(e);
    });

