import { DynamoDB, paginateScan } from "@aws-sdk/client-dynamodb";
import { CodeBuild, paginateListProjects } from "@aws-sdk/client-codebuild";

// NOTE: make sure this is set to the stage and region that the DDB table and CB projects reside
const STAGE = "beta"; // If running on your local stack, this should be "test"
const REGION = "us-west-2";

const codeBuild = new CodeBuild({ region: REGION });
const dynamoDB = new DynamoDB({ region: REGION });

async function listCodeBuildProjects() {
  let projects: string[] = [];
  for await (const page of paginateListProjects({ client: codeBuild }, {})) {
    projects.push(...(page.projects || []));
  }

  return projects;
}

async function listAppsInDDB() {
  // List only the appIds of all entries
  const scanCommandInput = {
    TableName: [STAGE, REGION, "App"].join("-"),
    Select: "SPECIFIC_ATTRIBUTES",
    ProjectionExpression: "appId",
  };

  let items = [];
  for await (const page of paginateScan(
    { client: dynamoDB },
    scanCommandInput
  )) {
    items.push(...(page.Items || []));
  }

  return items.map((item) => item.appId.S || "");
}

/**
 * Delete all CodeBuild projects that don't have an associated entry in the App DDB table.
 */
async function deleteCodeBuildProjects() {
  const projects = await listCodeBuildProjects();
  console.log(`Found ${projects.length} CodeBuild project(s):\n${projects}\n`);
  const apps = await listAppsInDDB();
  console.log(`Found ${apps.length} app(s):\n${apps}\n`);

  // Only delete projects whose names are likely an appID (is there a better way to do this?)
  const projectsToDelete = projects.filter(
    (project) =>
      !apps.includes(project) && project.startsWith("d") && project.length == 14
  );

  console.log(
    `Deleting ${projectsToDelete.length} CodeBuild project(s):\n${projectsToDelete}\n`
  );

  // NOTE: Uncomment these lines to actually delete
  // for (let project of projectsToDelete) {
  //     console.log(`Deleting ${project}`)
  //     await codeBuild.deleteProject({ name: project });
  // }
}

deleteCodeBuildProjects().then();
