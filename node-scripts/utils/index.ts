import { userInfo } from "os";

export * from "./accounts";
export * from "./isengardCreds";
export * from "./sleep";
export const whoAmI = (): string => userInfo().username
