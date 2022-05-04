export interface AmplifyAccount {
  region: string;
  accountId: string;
  stage?: string;
}

export interface Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: number;
}
