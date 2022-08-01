import {AmplifyRole} from "./upsertRole";

export const oncallOperatorRole: AmplifyRole = {
    IAMRoleName: "OncallOperator",
    Description: "OncallOperator",
    ContingentAuth: 1,
    PolicyTemplateReference: {
        OwnerID: "aws-mobile-amplify",
        PolicyTemplateName: "AmplifyOncallOperatorPolicy",
    },
};

export const adminRole: AmplifyRole = {
    IAMRoleName: "Admin",
    Description:
        "The Admin role is a highly permissive role that has *.* policy. With great power comes great responsibility.",
    ContingentAuth: 2,
    PolicyARNs: ["arn:aws:iam::aws:policy/AdministratorAccess"],
};

export const readOnlyRole: AmplifyRole = {
    IAMRoleName: "ReadOnly",
    Description:
        "The ReadOnly role is a restrictive role that does not allow mutations, use this role if you want to be safe.",
    ContingentAuth: 1,
    PolicyARNs: ["arn:aws:iam::aws:policy/ReadOnlyAccess"],
};

export const lambdaInvokerRole: AmplifyRole = {
    IAMRoleName: "LambdaInvoker",
    Description: "Role to see Hydra test results",
    ContingentAuth: 1,
    PolicyARNs: [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaRole",
        "arn:aws:iam::aws:policy/ReadOnlyAccess",
    ],
};
