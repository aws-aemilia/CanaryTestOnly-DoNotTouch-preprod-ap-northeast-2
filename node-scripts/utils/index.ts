import { userInfo } from "os";

export * from "./accounts";
export * from "./isengardCreds";
export * from "./sleep";
export * from "./kinesisAccounts";
export const whoAmI = (): string => userInfo().username;
