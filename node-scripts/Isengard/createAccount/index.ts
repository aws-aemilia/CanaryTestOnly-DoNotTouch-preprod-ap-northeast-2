import { computeServiceControlPlanePurposeFn } from "./accountPuporses/computeServiceControlPlane";
import { createAmplifyAccount } from "./createAmplifyAccount";
import { computeServiceCellPurposeFn } from "./accountPuporses/computeServiceCell";
import { Region, Stage } from "../types";

export const createComputeServiceControlPlaneAccount: (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => Promise<void> = createAmplifyAccount.bind(
  undefined,
  computeServiceControlPlanePurposeFn
);

export const createComputeServiceCellAccount: (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => Promise<void> = createAmplifyAccount.bind(
  undefined,
  computeServiceCellPurposeFn
);
