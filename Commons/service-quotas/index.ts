import {
  ServiceQuotasClient,
  GetServiceQuotaCommand,
  RequestServiceQuotaIncreaseCommand,
  GetRequestedServiceQuotaChangeCommand,
} from "@aws-sdk/client-service-quotas";

import { AmplifyAccount, getIsengardCredentialsProvider } from "../Isengard";

import sleep from "../utils/sleep";

const DESIRED_IAM_ROLE_COUNT = 5000; // This is the maximum hard limit
const IAM_QUOTA_CODE = "L-FE177D64";
const IAM_SERVICE_CODE = "iam";

export const increaseIAMRoles = async (account: AmplifyAccount) => {
  const creds = getIsengardCredentialsProvider(
    account.accountId,
    "OncallOperator"
  );

  const serviceQuotas = new ServiceQuotasClient({
    credentials: creds,
    region: "us-east-1",
  });

  const quota = await serviceQuotas.send(
    new GetServiceQuotaCommand({
      ServiceCode: IAM_SERVICE_CODE,
      QuotaCode: IAM_QUOTA_CODE,
    })
  );

  if (!quota.Quota || !quota.Quota.Value) {
    throw new Error("Quota not found");
  }

  if (quota.Quota.Value >= DESIRED_IAM_ROLE_COUNT) {
    console.log(
      "Account",
      account.accountId,
      "already has the desired IAM role quota"
    );
    return;
  }

  console.log(
    `Requesting limit increase for account ${account.cellNumber} (${account.accountId})`
  );

  const requestQuotaResponse = await serviceQuotas.send(
    new RequestServiceQuotaIncreaseCommand({
      QuotaCode: IAM_QUOTA_CODE,
      ServiceCode: IAM_SERVICE_CODE,
      DesiredValue: DESIRED_IAM_ROLE_COUNT,
    })
  );

  if (!requestQuotaResponse.RequestedQuota) {
    throw new Error("Failed to request quota");
  }

  console.log("Limit increased requested successfully");
  let limitUpdated = false;

  while (!limitUpdated) {
    await sleep(5000);
    const requestStatus = await serviceQuotas.send(
      new GetRequestedServiceQuotaChangeCommand({
        RequestId: requestQuotaResponse.RequestedQuota.Id,
      })
    );

    console.log("Request status is", requestStatus.RequestedQuota?.Status);
    if (requestStatus.RequestedQuota?.Status === "APPROVED") {
      limitUpdated = true;
    }
  }
};
