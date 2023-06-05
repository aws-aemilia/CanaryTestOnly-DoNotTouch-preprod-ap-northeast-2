# AWS Amplify Tools

## Code Organization
Here is the description of the top-level folders. Please Follow these conventions to keep the code organized and easy to find. 

*Note: This package was recently reorganized so some files in here may be misclassified. Feel free to move them where they belong.*

[OpsTools](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/OpsTools)
- Tools that are safe to run in prod
- Accept CLI params using `yargs`
- Have documentation at `ts-node <tool> --help`
- They take a `--stage` and `--region` parameter and operate in exactly one region. Read-only tools are exempt and may read from several regions

[SingleUseTools](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/SingleUseTools)
- Tools that meet all the criteria of an OpsTool
- Are meant to run only once. Often they are related to a sev2 or an MCM. This distinction is important because these tool won't be updated after they accomplish their purpose and may be deleted at any time. 
Other tools should not import code from here. Consider refactoring the useful parts into Commons

[ConfigBuilders](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/ConfigBuilders)
- Read-only scripts that build config files for other packages.

[Dev](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/Dev)
- Tools that interact only with dev resources (dev stacks, GitHub accounts, etc.) They do not operate on Amplify AWS accounts, not even beta.

[Commons](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/Commons)
- Useful classes and functions that are used across multiple tools.
- Be mindful of having clean interfaces and of breaking changes. This code is used by many tools.

[Etc](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/Etc)
- Any tools/scripts that do not fit in any of the above categories. Mostly small scripts that do some kind of reporting
- Code here should NOT write to prod. Write a proper ops tool instead.

### Folders excluded from build

[bash_scripts](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/bash_scripts)
- A few, old, useful bash scripts. 
- It is not recommended adding new bash scripts. In most cases it is better to write tools using typescript.

[other_excluded_from_build](https://code.amazon.com/packages/AWSAmplifyTools/blobs/mainline/--/other_excluded_from_build)
- Other code that was added in the past to this package.
- We may move it to a separate package.

## Working with this package

### Installing dependencies

```bash
brazil ws --sync --md
brazil-build install
```

If the above fails due to a package being supposedly not found, on the `AWSAmplifyTools/development` version
set, [merge from live](https://build.amazon.com/merge#{%22destination%22:%22AWSAmplifyTools/development%22,%22options%22:{%22source%22:%22live%22,%22add%22:[]}})
, then retry the last two commands above.

Tools that cut tickets rely on `kcurl`. If tools fail on macOS due to `kcurl` not being found, install it using `brew install env-improvements`.

### Use Prettier for code formatting

After running `brazil-build install` above, install your IDE's Prettier extension, and point it to this
project's `node_modules`. Or, run `npx prettier --write .` to reformat your script.

### Running a Node script

```bash
npx ts-node {script_name}.ts
```

### Contingent Authorization

For Isengard contingent authorization you will need to set one of the following environment variables to access accounts marked as production:

- `ISENGARD_MCM` - MCM ID 
- `ISENGARD_REVIEW_ID` - Consensus Review ID 
- `ISENGARD_SIM` - SIM Ticket ID



