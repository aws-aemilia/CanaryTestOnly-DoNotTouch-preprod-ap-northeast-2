/**
 * DLQ queues for customer actions that encountered a terminal error. Most commonly these are related to builds/deployments
 * <br>
 * This messages represent non-idempotent operations and should NEVER be retried.
 * <br>
 * This DLQ messages exist primarily to be investigated by the oncall and then deleted.
 */
const CUSTOMER_ACTION_DLQ = ["DeploymentServiceDLQ"];

/**
 * DLQ queues for async tasks that MUST be retried until they succeed
 * <br>
 * This messages represent idempotent operations and should NEVER be deleted, since they can leave resources in an inconsistent state if they are not processed.
 */
export const IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ = [
  "AemiliaControlPlaneLambda-AsyncResourceDeletionDLQ",
  "AemiliaControlPlaneLambda-DistributionDeletionDLQ",
  "AccountClosingDeletionDLQ",
  "AccountClosingDLQ",
];
export const IDEMPOTENT_ASYNC_TASK_METERING_DLQ = [
  "MeteringHostingDataTransferDLQ",
];

export const SAFE_TO_READ_QUEUES = [
  ...CUSTOMER_ACTION_DLQ,
  ...IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ,
  ...IDEMPOTENT_ASYNC_TASK_METERING_DLQ,
];

export const SAFE_TO_REDRIVE_QUEUES = [
  ...IDEMPOTENT_ASYNC_TASK_CONTROL_PLANE_DLQ,
  ...IDEMPOTENT_ASYNC_TASK_METERING_DLQ,
];

export const SAFE_TO_PURGE_QUEUES = [...CUSTOMER_ACTION_DLQ];
