# AHIO Traffic Replay

This tool is designed to replay traffic capture in the Hosting Gateway for image optimization requests, and replay that traffic against AHIO within the same region.

It will identify specific failure modes and output all of the information about the original request, replayed request, and replay result into a JSON file for debugging.

## CLI

```bash
Run AHIO Traffic Replay validation

Default output dir: ./tmp/ahioTrafficReplayResults

Usage:
npx ts-node SingleUseTools/ahio-traffic-replay/run.ts --stage prod
Usage with all options set:
npx ts-node SingleUseTools/ahio-traffic-replay/run.ts globalQuery \
  --stage prod \
  --startDate '2023-04-02T00:00:00-00:00' \
  --endDate '2023-04-08T00:00:00-00:00' \
  --concurrentRequestsPerRegion 5 \
  --outputDir ./output

Options:
  --stage                        stage to run the command
     [string] [required] [choices: "beta", "gamma", "preprod", "prod"]
  --startDate                    Query start date in ISO format for locating
                                 traffic to replay, for example
                                 2022-04-01T00:00:00 (defaults to 1 day ago)
                                                                        [string]
  --endDate                      Query end date in ISO format for locating
                                 traffic to replay, for example
                                 2022-04-01T00:00:00 (defaults to now)  [string]
  --concurrentRequestsPerRegion  Maximum number of concurrent requests to allow
                                 per region
                                                           [number] [default: 1]
  --outputDir                    Folder to output all results (defaults to
                                 ./tmp/ahioTrafficReplayResults)         [string]
  --region                       Limit searching and requests to a specific
                                 region (default to all regions)        [string]
  --help                         Show help                             [boolean]
```

## Script output

The script outputs a JSON document per region.

Properties within the output:

- problemCount: Number of replayed requests that experienced any type of problem
- successCount: Number of replayed requests that completely succeeded
- problemSummary: Count of each problem type that occurred
- allProblems: Array of the problems that occurred
  - problems: Array of problems that occurred during request
  - requestNumber: Used for debugging a single problem with the `debugSingleRequest.ts` script
  - imageRequest: All data gathered from the hosting gateway log line
  - ahioRequest: The object that was sent to AHIO to replay the request
  - ahopResult: The output of the replayed request including timing information and tailed lambda logs

## Debugging a single request

A script designed to allow replaying a single AHIO request from the problems array of a regions output.

```
Run single problem request

Default output dir: ./tmp/ahioTrafficReplayResults

Usage:

npx ts-node debugSingleRequest.ts
    --region ca-central-1 \
    --problemRequestNumber 0 \
    --stage prod

Options:
  --region                       Region of problem as region (Not Airport code)
                                                                        [string]
  --stage                        Stage to run the command
               [string] [required] [choices: "beta", "gamma", "preprod", "prod"]
  --problemRequestNumber         The number of the problem you want to further
                                 diagnose                               [string]
  --help                         Show help                             [boolean]
```

The `problemRequestNumber` must correspond with a `requestNumber` from a problem in the regions JSON file.