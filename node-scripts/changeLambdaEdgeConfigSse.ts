import { controlPlaneAccounts, getIsengardCredentialsProvider } from "./Isengard";
import { DynamoDB, DynamoDBServiceException } from "@aws-sdk/client-dynamodb";
import { toAirportCode } from "./utils/regions";

const STAGE = "prod";
const ROLE = "OncallOperator";
const IAD = "us-east-1";  // Not all regions have L@E, but all accounts' LEC tables are replicated in IAD.

async function main() {
    const controlPlaneAccounts_ = await controlPlaneAccounts({stage: "prod"});
    for (const controlPlaneAccount of controlPlaneAccounts_) {
        const dynamodb = new DynamoDB({
            region: IAD,
            credentials: getIsengardCredentialsProvider(
                controlPlaneAccount.accountId,
                ROLE
            )
        });

        const region = toAirportCode(controlPlaneAccount.region);
        console.log(`Switching encryption key of LambdaEdgeConfig in ${STAGE}-${region} to DDB-owned...`)

        try {
            await dynamodb.updateTable({
                TableName: "LambdaEdgeConfig",
                SSESpecification: {
                    Enabled: false
                }
            });
        } catch (e) {
            if (e instanceof DynamoDBServiceException && e.message.includes("Table is already encrypted by default")) {
                console.log("Already set to DDB-owned, skipping.")
            } else {
                throw e;
            }
        }
    }
}

main().then().catch(r => console.error(r))
