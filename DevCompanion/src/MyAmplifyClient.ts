import { Amplify, App } from "@aws-sdk/client-amplify";
import { getControlPlaneApi } from "./config";

export class MyAmplifyClient {
  private amplify: Amplify;

  constructor(stage: string, region: string) {
    const endpoint =
      stage === "test"
        ? process.env.CP_Endpoint
        : getControlPlaneApi(stage, region);

    this.amplify = new Amplify({
      region,
      endpoint,
    });
  }

  public async listApps() {
    let nextToken: string | undefined = undefined;
    let apps: App[] = [];
    do {
      const res = await this.amplify.listApps({ maxResults: 100, nextToken });
      // console.debug(res);
      nextToken = res.nextToken;
      apps.push(...res.apps);
    } while (nextToken!!);

    return apps;
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
