import { Region, Stage } from "../../types";
import { toAirportCode } from "../../../utils/regions";
import { capitalize } from "../createAmplifyAccount";
import {AccountPurposeFn} from "./types";

export const computeServiceCellPurposeFn: AccountPurposeFn = (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => {
  if (cellNumber === undefined) {
    throw new Error(
      "You must specify a cell number to create this type of account"
    );
  }
  if (cellNumber <= 0) {
    throw new Error("cell number must be greater or equal to 1");
  }

  if (cellNumber > 10) {
    throw new Error(
      "WARNING, the provided cell number seems too big. You may remove this check from this tool if you truly want to create that many cells"
    );
  }

  const airportCode = toAirportCode(region);
  const emailSuffix = `compute-service-${stage}-${airportCode.toLowerCase()}-cell${cellNumber}@amazon.com`;
  return {
    Email: `aws-mobile-amplify+${emailSuffix}`,
    // Name must be less than 50 chars
    Name: emailSuffix,
    Description: `Amplify Compute Service ${capitalize(
      stage
    )} ${airportCode.toUpperCase()} Cell ${cellNumber}`,
    Group: `Amplify Compute Service/${capitalize(stage)}`,
  };
};
