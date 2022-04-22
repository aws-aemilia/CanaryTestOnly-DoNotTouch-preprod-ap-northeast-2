import { AmplifyService } from "./types";

export const AmplifyServices: AmplifyService[] = [
    {
        serviceName:`Control Plane`,
        logGroup: `ServiceLogs`,
        linkToQuery: `https://tiny.amazon.com/emhr17g3/IsenLink`,
        throttlingQuery: `fields @timestamp, region
        | filter service like /AemiliaControlPlaneLambda/
        | sort @timestamp desc
        | parse @message '\\"exceptionMessage\\":\\"*\\",' as exceptionMessage
        | parse @message '\\"accountId\\":\\"*\\",' as customerAccountId
        | parse @message '\\"operation\\":\\"*\\",' as operation
        | filter @message like '\\"canary\\":false,'
        | filter exceptionMessage like "Rate exceeded"
        | parse exceptionMessage 'Rate exceeded (Service: *;' as theService
        | stats count(*) as throttles by customerAccountId, region, theService`
    },
    {
        serviceName: `Deployment Processor`,
        logGroup: `ServiceLogs`,
        linkToQuery: `https://tiny.amazon.com/grnhkywn/IsenLink`,
        throttlingQuery: `fields @timestamp, region, log
        | filter service like /DeploymentService/
        | filter @message like "Throttling: Rate exceeded"
        | parse log "*|*|*|*:" as customerAccountId, appId, branch, jobId
        | stats count(*) as throttles by customerAccountId, region`
    }
]