import { Lambda, paginateListFunctions } from "@aws-sdk/client-lambda";

/**
 * Loop through all functions in a region (defined by the provided lambda client) 
 *  till a match with the provided `prefix` is found, then return immediately.
 * @param lambda sdk v3 lambda client
 * @param prefix prefix to match with. Uses startsWith() function for matching.
 * @return The full FunctionName `string` if a match is found. `undefined` if no match is found.
 */ 
export const getFunctionNameWithPrefix = async (lambda: Lambda, prefix: string) => {
    try {
        for await (const page of paginateListFunctions({ client: lambda }, {})) {
            const name = page.Functions?.find((func => func.FunctionName && func.FunctionName.startsWith(prefix) ))?.FunctionName;
            if (name) {
                return name;
            }
        }
    } catch(e) {
        console.error(e);
    }
}