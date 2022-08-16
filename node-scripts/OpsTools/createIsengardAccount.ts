import {
  computeServiceControlPlaneAccount,
  computeServiceDataPlaneAccount,
  createComputeServiceCellAccount,
  createComputeServiceControlPlaneAccount,
  createDataPlaneAccount,
  dataPlaneAccount,
  Region,
  Stage,
} from "../Isengard";
import yargs from "yargs";
import { deleteCache } from "../Isengard/cache";

const main = async ()=> {

    const args = await yargs(process.argv.slice(2))
        .usage(
            `
Create a compute service account
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
            await computeServiceControlPlaneAccount(stage, region)
            break;
        case 'computeServiceCell':
            await createComputeServiceCellAccount(stage, region, cellNumber);
            console.log('SUCCESS')
            console.log('Refreshing the local account cache...')
            await deleteCache('computeServiceDataPlaneAccounts');
            await computeServiceDataPlaneAccount(stage, region, cellNumber!)
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

