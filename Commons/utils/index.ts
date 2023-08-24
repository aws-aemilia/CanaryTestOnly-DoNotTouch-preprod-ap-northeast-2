import { userInfo } from "os";

export * from "./sleep";
export const whoAmI = (): string => userInfo().username;
