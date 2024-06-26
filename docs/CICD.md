Automation
This document outlines the automation processes to test and to release a new development version of distributedkube.

Overview
The main development branch is master. New features are developed in feature branches, and after a PR process, the branch is merged into master distributedkube core is a monorepo (managed by lerna) that currently includes 17 services. It has a master version in package.json that is patch incremented on every commit to master. In addition, each of the services has it's own version (e.g. worker) that is also incremented each time the service is changed. The services major and minor versions always match the repo's major and minor versions. distributedkube's version name is the major.minor version (e.g. 2.3, 2.4, etc.)

CI Process
There are two main ci process. One for PR's and another for master commits.

PR workflow
When creating a PR or adding commit to the branch, The CI-PR workflow is executed. It will install dependencies, and run unit-tests in all changed services. Changed services are detected using the lerna changed command.

Master workflow
When committing to master the CI-MAIN workflow is executed. This workflow is the first of four workflows that are executed serially.

test and build
Similar to the CI-PR workflow, it will will install dependencies, and run unit-tests in all changed services. If no services were changed (e.g. README.md changed) the workflow stops. It is possible to override this by setting the BUILD_ALL workflow input to true. If the commit message includes [skip ci] the workflow is not executed. In addition to running tests, the CI-MAIN workflow also increments the patch version of all changes services, increments the patch version of the main package.json, and build dockers for all changed services.

release manager
The release-manager main workflow is triggered after the CI-MAIN workflow ends. When executing this workflow the distributedkube branch can be set with the BRANCH input parameter (defaults to master). Setting different branches is useful when updating a frozen version. The workflow collects all of the github repos that has the distributedkube-core topic. It then tries to find the latest version that matches the major.minor.* requested (based on the BRANCH input). A new release is created and all of the versions are collected and saved in version.json and version.yaml artifact files. The name of the release is the main version of the distributedkube branch + a unique timestamp.

helm
The helm main workflow is triggered by the release-manager main workflow. The workflow has the following inputs:

BRANCH: The branch to checkout (e.g. master, release_v1_3)
TAG: The tag (release name) from the release-manager repo. The version.yaml file of that release will be used to set the new docker versions.
FROZEN_VERSION: If true, will add the new chart to the distributedkube helm repo. If false (default) will add it to the distributedkube-dev helm repo.
DEPLOY: If true will trigger the deployment of the chart to the cicd cluster. Defaults to true for master branch and false for all other branches.
The workflow increments the patch version, and creates a new chart (see package.sh). The script uses a helper util version-updater to update the docker tags in values.yaml based on the version.yaml file from the release-manager. The packaged chart is copied to the ./dev folder for dev version or the ./ folder for a frozen version in the gh-pages branch.

deploy
The cd-manager main workflow is triggered by the helm workflow. The workflow accepts the following inputs:

version: The helm chart to install (e.g. v2.4.10)
The workflow sets kubeconfig from github secrets and tries to install the chart in the cicd cluster. If the chart is not ready yet, the workflow retries up to 20 times. After the chart is installed, the sanity tests are executed.

Frozen Version Development
When needed it is possible to make changes to a frozen version (create release patches).

Checkout the version branch (e.g. release_v2.3)
Create a feature brance for the fix (make sure to not name is release* as this is a reserved prefix).
Create the fix, and commit the changes
Create a PR. This will run the regular PR checks and allow for a code-review.
Optionally deploy to dev1 cluster for testing (/deply comment, only on distributedkube repo).
When the PR is merged the CI-FROZEN workflow is executed to build the new version and trigger a new helm chart (dev-version)
After the dev-version is tested, run the CI-PROMOTE workflow specifing the chart version to promote the helm chart from dev-version to frozen version (from ./dev to ./).
Optionally run the CI-CREATE-RELEASE_BUND