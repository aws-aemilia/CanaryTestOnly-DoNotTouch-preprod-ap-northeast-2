import { Amplify } from "@aws-sdk/client-amplify";
import dotenv from "dotenv";

dotenv.config();

const endpoint = process.env.ENDPOINT_ME;
const region = process.env.REGION;

const amplify = new Amplify({
  region,
  endpoint,
});

async function main() {
  const res = await amplify.listApps({});
  console.log(JSON.stringify(res.apps, undefined, 2));
}

main().catch((e) => {
  console.log("Failed to run main", e);

  process.exit(1);
});
