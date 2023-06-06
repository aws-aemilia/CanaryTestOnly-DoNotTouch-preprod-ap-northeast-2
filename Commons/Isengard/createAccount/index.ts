import { computeServiceControlPlanePurposeFn } from "./accountPuporses/computeServiceControlPlane";
import { createAmplifyAccount } from "./createAmplifyAccount";
import { computeServiceCellPurposeFn } from "./accountPuporses/computeServiceCell";
import { Region, Stage } from "../types";
import { dataPlanePurposeFn } from "./accountPuporses/dataPlane";

export type CreateAccountFn = (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => Promise<void>;

export const createComputeServiceControlPlaneAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, computeServiceControlPlanePurposeFn);

export const createComputeServiceCellAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, computeServiceCellPurposeFn);

export const createDataPlaneAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, dataPlanePurposeFn);
