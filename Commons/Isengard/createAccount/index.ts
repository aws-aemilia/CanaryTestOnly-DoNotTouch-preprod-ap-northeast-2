import { kinesisConsumerTestPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/kinesisConsumer";
import { integrationTestPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/integrationTest";
import { aesIntegrationTestPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/aesIntegration";
import { computeServiceCellPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/computeServiceCell";
import { computeServiceControlPlanePurposeFn } from "Commons/Isengard/createAccount/accountPurposes/computeServiceControlPlane";
import { cfnRegistryPurposeFn } from "Commons/Isengard/createAccount/accountPurposes/cfnRegistry";
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

export const createKinesisConsumerAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, kinesisConsumerTestPurposeFn, true);

export const createIntegTestAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, integrationTestPurposeFn, true);

export const createCfnRegistryAccount: CreateAccountFn =
  createAmplifyAccount.bind(undefined, cfnRegistryPurposeFn, true);
