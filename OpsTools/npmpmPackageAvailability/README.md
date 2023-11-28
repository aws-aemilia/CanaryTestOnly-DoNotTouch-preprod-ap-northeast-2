# Why this script

This script can be used whenever you want to create a new package using npm packages that are present in the npm
registry. Amazon has an internal npm-pretty-much registry which is used while running brazil-build installs. 
All builds are also  run inside a 'network-jail' which prevents requests to non-amazon registries.

This script identifies all npm packages that are currently unavailable in npm-pm which you seem to use for your package.
These packages need to be allow-listed by creating tickets before they can be consumed.

# How to run script

1. Copy the path to your package.json file or copy the package.json file within this dir
2. run ts-node checkAvailability.ts --packagePath {path_to_your_package_json_file}. packagePath is set to current dir by default
3. The script outputs all packages along with their version. These need to be made available/allow-listed in npm-pm

# How to get a npm package allow-listed.

1. Create a ticket at https://t.corp.amazon.com/create/templates/c71e35b0-8494-45e1-ad24-d82fc713bcca
2. For more details check here: https://w.amazon.com/bin/view/NpmPrettyMuch/MissingPackage