import { AmplifyRole } from "./upsertRole";
import { Stage } from "../types";

const POSIX_GROUP = "aws-mobile-amplify-oncall";

const oncallOperatorRole: AmplifyRole = {
  IAMRoleName: "OncallOperator",
  Description:
    "The OncallOperator role has limited write permissions that cover the usual oncall operations. Do not use this role if you need read-only access",
  ContingentAuth: 1,
  PolicyTemplateReference: [
    {
      OwnerID: "aws-mobile-amplify-oncall",
      PolicyTemplateName: "AmplifyOncallOperatorPolicy",
    },
  ],
  PolicyARNs: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
  Group: POSIX_GROUP,
  FederationTimeOutMin: 15,
};

export const adminRoleFn = (stage: Stage): AmplifyRole => ({
  IAMRoleName: "Admin",
  Description:
    "The Admin role is a highly permissive role that has *.* policy. Use with extreme caution and only for emergencies",
  ContingentAuth: 2,
  PolicyARNs: ["arn:aws:iam::aws:policy/AdministratorAccess"],
  Group: stage === "prod" ? undefined : POSIX_GROUP,
  FederationTimeOutMin: 15,
});

const readOnlyRole: AmplifyRole = {
  IAMRoleName: "ReadOnly",
  Description:
    "The ReadOnly role does not allow mutations and does not have access to customer data. Use this role if you want to be safe.",
  ContingentAuth: 0,
  PolicyTemplateReference: [
    {
      OwnerID: "harp-sec",
      PolicyTemplateName: "StandardAuthorizationRolePolicy",
    },
    {
      OwnerID: POSIX_GROUP,
      PolicyTemplateName: "StandardAuthorizationRolePolicy-Amplify-Extra",
    },
  ],
  Group: POSIX_GROUP,
  FederationTimeOutMin: 90,
  // Individual users to grant permissions
  Users: [
    "hloriana",
    "jayrava",
  ]
};

const fullReadOnlyRole: AmplifyRole = {
  IAMRoleName: "FullReadOnly",
  Description:
    "The FullReadOnly role does not allow mutations. Use this role for read-only operations that need access to customer data",
  ContingentAuth: 1,
  PolicyARNs: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
  Group: POSIX_GROUP,
  FederationTimeOutMin: 60,
  // Individual users to grant permissions
  Users: [
    "hloriana",
    "jayrava",
  ]
};

const lambdaInvokerRole: AmplifyRole = {
  IAMRoleName: "LambdaInvoker",
  Description: "Role to see Hydra test results",
  ContingentAuth: 1,
  PolicyARNs: [
    "arn:aws:iam::aws:policy/service-role/AWSLambdaRole",
    "arn:aws:iam::aws:policy/ReadOnlyAccess",
  ],
  Group: POSIX_GROUP,
  FederationTimeOutMin: 60,
};

const mobileCoreSupportRole: AmplifyRole = {
  IAMRoleName: "MobileCoreSupport",
  Description: "For mobile core support team to access build logs",
  ContingentAuth: 1,
  Group: "support-ops-mobile-core", // https://permissions.amazon.com/a/team/aws-support-ops-mobile-core
  FederationTimeOutMin: 60,
  PolicyTemplateReference: [
    {
      OwnerID: "aws-mobile-amplify-oncall",
      PolicyTemplateName: "MobileCoreSupport",
    }
  ],
};

export const getRolesForStage = (
  stage: Stage
): {
  ReadOnly: AmplifyRole;
  OncallOperator: AmplifyRole;
  FullReadOnly: AmplifyRole;
  Admin: AmplifyRole;
  LambdaInvoker: AmplifyRole;
  MobileCoreSupport: AmplifyRole;
} => {
  return {
    OncallOperator: oncallOperatorRole,
    Admin: adminRoleFn(stage),
    ReadOnly: readOnlyRole,
    FullReadOnly: fullReadOnlyRole,
    LambdaInvoker: lambdaInvokerRole,
    MobileCoreSupport: mobileCoreSupportRole,
  };
};
