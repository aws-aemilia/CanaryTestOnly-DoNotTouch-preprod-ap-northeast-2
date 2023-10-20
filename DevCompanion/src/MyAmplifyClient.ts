import { Amplify } from "@aws-sdk/client-amplify";
import { getControlPlaneApi } from "./config";

export class MyAmplifyClient {
  private amplify: Amplify;

  constructor(stage: string, region: string) {
    const endpoint = getControlPlaneApi(stage, region);

    this.amplify = new Amplify({
      region,
      endpoint,
    });
  }

  public listApps() {
    return this.amplify.listApps({ maxResults: 100 });
  }

  public getApp(appId: string) {
    return this.amplify.getApp({ appId });
  }

  public deleteApp(appId: string) {
    return this.amplify.deleteApp({ appId });
  }

  public listBranches(appId: string) {
    return this.amplify.listBranches({ appId });
  }
}
