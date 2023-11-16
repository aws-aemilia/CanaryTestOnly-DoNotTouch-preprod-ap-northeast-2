import { aesIntegrationTestPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/aesIntegration";
import { computeServiceCellPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/computeServiceCell";
import { computeServiceControlPlanePurposeFn } from "Commons/Isengard/createAccount/accountPurposes/computeServiceControlPlane";
import { dataPlanePurposeFn } from "Commons/Isengard/createAccount/accountPurposes/dataPlane";
import { Region, Stage } from "../types";
import { createAmplifyAccount } from "./createAmplifyAccount";

export type CreateAccountFn = (
  stage: Stage,
  region: Region,
  cellNumber?: number
) => Promise<void>;

export const createComputeServiceControlPlaneAccount: CreateAccountFn =
  createAmplifyAccount.bind(
    undefined,
    computeServiceControlPlanePurposeFn,
    true
  );

export const createComputeServiceCellAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, computeServiceCellPurposeFn, true);

export const createDataPlaneAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, dataPlanePurposeFn, true);

export const createAESIntegTestAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, aesIntegrationTestPurposeFn, false);
