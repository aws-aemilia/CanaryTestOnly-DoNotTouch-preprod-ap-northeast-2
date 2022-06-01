import util from "util";
import { exec as execNonPromise } from "child_process";
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

export type Ticket = { description: string; title: string };

/**
 * Retrieves a ticket.
 * Calls the Maxis API using kerberos auth. Requires kcurl to be installed.
 * @param ticketId
 */
export const getTicket = async (ticketId: string): Promise<Ticket> => {
  // kcurl was chosen because it's the easiest way to fetch private tickets.
  // Most libraries (e.g NodeJS-SIMClient) use AWS SigV4 but it's hard to make that identity have permissions on all our private tickets
  const getTicketCommand = `kcurl -k https://maxis-service-prod-iad.amazon.com/issues/${ticketId}`;

  const rawOutput = await executeCommand(getTicketCommand);

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

  if (response.message) {
    // SIM returns errors on the message field
    throw new Error(response.message);
  }

  return {
    title: response.title as string,
    description: response.description as string,
  };
};
