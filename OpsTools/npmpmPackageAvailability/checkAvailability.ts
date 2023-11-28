/**
 * Simple script to check if a package is available in npm-pretty-much repository
 * Some packages may be deny-list/unavailable. These include transitive dependencies of your primary dependencies
 * as well.
 * This script recursively iterates across the dependency tree and lists out all packages that needs to be allow-listed
 * to consume a new npm module.
 */

import * as fs from "fs";
import path from "path";
import { execSync } from "child_process";
import yargs from "yargs";
import pino from "pino";
import pinoPretty from "pino-pretty";

const log = pino(pinoPretty());

// brazil-build commands can only be run from the root dir with a Config file
const rootToolsPackageDir = path.join(__dirname, "../..");
let unavailableModules: string[] = [];

type DependencyMetaType = {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  devOptional?: boolean;
  requires?: Record<string, string>;
  dependencies?: Record<string, DependencyMetaType>;
};

const executeCommand = (command: string, execDir: string) => {
  try {
    // Prevent printing brazil-build install logs
    execSync(command, { cwd: execDir, stdio: ["ignore", "ignore", "ignore"] });
    return true; // return true if successful (no error)
  } catch (error: any) {
    return false;
  }
};

const brazilBuildCommand = (packageName: string) => {
  return `brazil-build install ${packageName} --no-save --prefix ${__dirname}`;
};

/**
 * The idea of recursion here is that we don't need to check if a package is available if the main package is
 * available. This implicitly means that the dependency package is available.
 */
const recursiveDependencyAnalysis = (
  dependency: string,
  dependencyMap: DependencyMetaType
) => {
  // deduped module
  if (!dependencyMap.version) {
    return;
  }

  // Check if main package is available
  const fullPackageName = `${dependency}@${dependencyMap["version"]}`;

  // Check if package was checked already
  if (unavailableModules.includes(fullPackageName)) {
    return;
  }

  if (
    !executeCommand(brazilBuildCommand(fullPackageName), rootToolsPackageDir)
  ) {
    unavailableModules.push(fullPackageName);
    const { dependencies } = dependencyMap;
    if (dependencies) {
      // If the package is unavailable run function for all its dependencies
      for (const [childDependency, childDependencyData] of Object.entries(
        dependencies
      )) {
        recursiveDependencyAnalysis(childDependency, childDependencyData);
      }
    }
  }
  return;
};

const main = async () => {
  const args = await yargs(process.argv.slice(2))
    .usage(
      `Simple script to recursively iterates across the dependency tree \
and lists out all packages that needs to be allow-listed to consume a new npm module.`
    )
    .option("packagePath", {
      describe: "Path to package.json file to test with",
      type: "string",
      demandOption: true,
      default: __dirname,
    })
    .strict()
    .version(false)
    .help().argv;
  const { packagePath: packageJsonFilePath } = args;

  // Check if package.json file exists
  if (!fs.existsSync(packageJsonFilePath)) {
    log.error(
      "package.json file not found. Create the file in the dir or rename an existing file"
    );
    process.exit(1);
  }

  log.info("package.json file found, creating dependency tree ...");

  // Installing the packages and creating a temporary dependency tree
  const success = executeCommand(
    "npm install --no-save && npm ls --all --json >> dependency-tree.json",
    __dirname
  );
  if (!success) {
    log.error("Failed to create dependency tree");
    process.exit(1);
  }

  const dependencyTree = fs.readFileSync(
    path.join(__dirname, "dependency-tree.json"),
    "utf-8"
  );
  const dependencyTreeJson = JSON.parse(dependencyTree);

  const { dependencies: mainDependencies } = dependencyTreeJson;
  for (const packageName of Object.keys(mainDependencies)) {
    const packageMeta: DependencyMetaType = mainDependencies[packageName];
    log.info(
      `Dependencies needed to be verified to consume ${packageName} are as follows: `
    );
    // Reset and call for next dependency
    unavailableModules = [];
    recursiveDependencyAnalysis(packageName, packageMeta);
    for (const item of unavailableModules) {
      log.info(`\t Dependency to be verified: ${item}`);
    }
  }

  // Cleanup
  executeCommand(
    "rm -rf node_modules package-lock.json dependency-tree.json",
    __dirname
  );
};

main()
  .then()
  .catch((error) => {
    log.error("\nSomething went wrong [%s]", error);
  });
