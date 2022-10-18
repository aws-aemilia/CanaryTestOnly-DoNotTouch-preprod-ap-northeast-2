/**
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 *
 * PLEASE USE THIS INSTEAD
 *
 * import { AmplifyAccount } from './Isengard/accounts';
 */
export interface AmplifyAccount {
  region: string;
  accountId: string;
  stage?: 'test'|'beta'|'gamma'|'prod';
}

/**
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 * THIS IS DEPRECATED!!!!
 *
 * PLEASE USE THIS INSTEAD
 *
 * import { Credentials } from "@aws-sdk/types";
 */
export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number;
}
