import { exec as execNonPromise } from "child_process";
import util from "util";
import confirm from "../utils/confirm";

export interface CreateTicketParams {
  title: string;
  description: string;
  assignedFolder: string;
  extensions: {
    tt: {
      category: string;
      type: string;
      item: string;
      assignedGroup: string;
      caseType: string;
      impact: number;
    };
  };
}

export const createTicket = async (
  createTicketParams: CreateTicketParams
): Promise<string> => {
  console.log("Creating ticket:", createTicketParams);
  const command = `kcurl -X POST -d '${JSON.stringify(
    createTicketParams
  )}' -H 'Content-Type: application/json' https://maxis-service-prod-pdx.amazon.com/issues`;

  console.log(command);

  const rawOutput = await executeCommand(command);

  let response: any;
  try {
    response = JSON.parse(rawOutput);
  } catch (e) {
    console.log(
      "Failed to parse response as JSON. This most likely means that your credentials are missing. Did you run kinit?"
    );
    console.log(rawOutput);
    throw e;
  }

  if (response.id) {
    return response.id;
  }
  throw new Error(
    `Unexpected response from SIM ticketing: ${JSON.stringify(
      response,
      null,
      2
    )}`
  );
};

const exec = util.promisify(execNonPromise);

const executeCommand = async (command: string): Promise<string> => {
  try {
    const { stdout, stderr } = await exec(command);
    return stdout;
  } catch (e) {
    console.log(`Failed to run command: ${command}`);
    throw e;
  }
};
