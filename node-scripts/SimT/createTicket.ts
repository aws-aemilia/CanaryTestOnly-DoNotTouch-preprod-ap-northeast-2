import { exec as execNonPromise } from "child_process";
import util from "util";
import confirm from "../utils/confirm";

export const createTicket = async (
  title: string,
  description: string,
  assignedFolder: string,
  assignedGroup: string,
  impact: number,
  c: string,
  t: string,
  i: string
): Promise<string> => {
  const createTicketParams = {
    title,
    description,
    assignedFolder,
    extensions: {
      tt: {
        category: c,
        type: t,
        item: i,
        assignedGroup: assignedGroup,
        caseType: "Trouble Ticket",
        impact,
      },
    },
  };

  console.log(createTicketParams);

  const proceed = await confirm(`Do you want to cut the above ticket?`);
  if (!proceed) {
    console.log("Skipping cutting ticket");
    return "";
  }

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
