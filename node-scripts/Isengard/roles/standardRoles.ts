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
};

export const adminRoleFn = (stage: Stage): AmplifyRole => ({
  IAMRoleName: "Admin",
  Description:
    "The Admin role is a highly permissive role that has *.* policy. Use with extreme caution and only for emergencies",
  ContingentAuth: 2,
  PolicyARNs: ["arn:aws:iam::aws:policy/AdministratorAccess"],
  Group: stage === "prod" ? undefined : POSIX_GROUP,
});

const readOnlyRole: AmplifyRole = {
  IAMRoleName: "ReadOnly",
  Description:
    "The ReadOnly role does not allow mutations and does not have access to customer data. Use this role if you want to be safe.",
  ContingentAuth: 0,
  PolicyTemplateReference: [
    {
      OwnerID: 'harp-sec',
      PolicyTemplateName: "StandardAuthorizationRolePolicy",
    },
    {
      OwnerID: POSIX_GROUP,
      PolicyTemplateName: "StandardAuthorizationRolePolicy-Amplify-Extra",
    },
  ],
  Group: POSIX_GROUP,
};

const fullReadOnlyRole: AmplifyRole = {
  IAMRoleName: "FullReadOnly",
  Description:
    "The FullReadOnly role does not allow mutations. Use this role for read-only operations that need access to customer data",
  ContingentAuth: 1,
  PolicyARNs: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
  Group: POSIX_GROUP,
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
};

export const getRolesForStage = (stage: Stage): AmplifyRole[] => {
  return [
    oncallOperatorRole,
    adminRoleFn(stage),
    readOnlyRole,
    fullReadOnlyRole,
    lambdaInvokerRole,
  ];
};
